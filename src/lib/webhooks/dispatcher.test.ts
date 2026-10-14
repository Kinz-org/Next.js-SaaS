import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { verifySignature } from "./signer";

// dispatcher.ts is the seam between signer.ts and retry.ts. These tests pin
// the status bookkeeping scheduleRetry() depends on: a failed delivery must be
// recorded as FAILED with attempts incremented *before* it is handed to the
// scheduler, and a successful one must never be scheduled for retry.

const findManyMock: Mock = vi.fn();
const createMock: Mock = vi.fn();
const updateMock: Mock = vi.fn().mockResolvedValue({});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEndpoint: { findMany: (...a: unknown[]) => findManyMock(...a) },
    webhookEvent: {
      create: (...a: unknown[]) => createMock(...a),
      update: (...a: unknown[]) => updateMock(...a),
    },
  },
}));

const scheduleRetryMock: Mock = vi.fn().mockResolvedValue(undefined);
vi.mock("./retry", () => ({
  scheduleRetry: (...a: unknown[]) => scheduleRetryMock(...a),
}));

const { dispatchWebhookEvent } = await import("./dispatcher");

const ORG = "org-1";
const EVENT_TYPE = "conversation.created";
const PAYLOAD = { conversation: { id: "conv-1" } };
const SECRET = "endpoint-secret"; // gitleaks:allow - test fixture

function endpoint(id: string, url = `https://receiver.test/${id}`) {
  return { id, url, secret: `${SECRET}-${id}`, isActive: true, events: [EVENT_TYPE] };
}

let fetchMock: Mock;
let eventSeq = 0;

beforeEach(() => {
  vi.clearAllMocks();
  eventSeq = 0;
  createMock.mockImplementation(async () => ({ id: `evt-${++eventSeq}` }));
  updateMock.mockResolvedValue({});
  scheduleRetryMock.mockResolvedValue(undefined);
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("dispatchWebhookEvent: endpoint lookup", () => {
  it("queries only active endpoints of the org subscribed to the event type", async () => {
    findManyMock.mockResolvedValue([]);

    await dispatchWebhookEvent(ORG, EVENT_TYPE, PAYLOAD);

    expect(findManyMock).toHaveBeenCalledWith({
      where: { organizationId: ORG, isActive: true, events: { has: EVENT_TYPE } },
    });
  });

  it("is a no-op when no endpoint is subscribed: no event row, no request", async () => {
    findManyMock.mockResolvedValue([]);

    await dispatchWebhookEvent(ORG, EVENT_TYPE, PAYLOAD);

    expect(createMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(scheduleRetryMock).not.toHaveBeenCalled();
  });
});

describe("dispatchWebhookEvent: request shape", () => {
  it("records a PENDING event, then POSTs a signed JSON body with a timeout", async () => {
    findManyMock.mockResolvedValue([endpoint("ep-1")]);

    await dispatchWebhookEvent(ORG, EVENT_TYPE, PAYLOAD);

    expect(createMock).toHaveBeenCalledTimes(1);
    const createArg = createMock.mock.calls[0]![0] as {
      data: {
        endpointId: string;
        eventType: string;
        status: string;
        payload: Record<string, unknown>;
      };
    };
    expect(createArg.data).toMatchObject({
      endpointId: "ep-1",
      eventType: EVENT_TYPE,
      status: "PENDING",
      payload: { event: EVENT_TYPE, payload: PAYLOAD },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://receiver.test/ep-1");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Webhook-Event"]).toBe(EVENT_TYPE);

    // The body the receiver gets is exactly what was signed, with that endpoint's secret.
    const body = init.body as string;
    expect(verifySignature(body, headers["X-Webhook-Signature"]!, `${SECRET}-ep-1`)).toBe(true);
    const parsed = JSON.parse(body) as { event: string; payload: unknown; timestamp: string };
    expect(parsed.event).toBe(EVENT_TYPE);
    expect(parsed.payload).toEqual(PAYLOAD);
    expect(Number.isNaN(Date.parse(parsed.timestamp))).toBe(false);
    // The stored payload is the same envelope that was sent.
    expect(createArg.data.payload).toEqual(parsed);
  });
});

describe("dispatchWebhookEvent: status transitions", () => {
  it("marks a 2xx delivery DELIVERED with the response code and does not schedule a retry", async () => {
    findManyMock.mockResolvedValue([endpoint("ep-1")]);
    fetchMock.mockResolvedValue({ ok: true, status: 204 });

    await dispatchWebhookEvent(ORG, EVENT_TYPE, PAYLOAD);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      data: { status: "DELIVERED", responseCode: 204, deliveredAt: expect.any(Date) },
    });
    expect(scheduleRetryMock).not.toHaveBeenCalled();
  });

  it("marks a non-2xx delivery FAILED, increments attempts, then schedules a retry", async () => {
    findManyMock.mockResolvedValue([endpoint("ep-1")]);
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await dispatchWebhookEvent(ORG, EVENT_TYPE, PAYLOAD);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      data: { status: "FAILED", responseCode: 503, attempts: { increment: 1 } },
    });
    expect(scheduleRetryMock).toHaveBeenCalledTimes(1);
    expect(scheduleRetryMock).toHaveBeenCalledWith("evt-1");
    // scheduleRetry reads `attempts` to pick the backoff step, so the
    // increment must have been written before it runs.
    expect(updateMock.mock.invocationCallOrder[0]!).toBeLessThan(
      scheduleRetryMock.mock.invocationCallOrder[0]!
    );
  });

  it("marks a thrown request (network error / timeout) FAILED without a response code, then schedules a retry", async () => {
    findManyMock.mockResolvedValue([endpoint("ep-1")]);
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await dispatchWebhookEvent(ORG, EVENT_TYPE, PAYLOAD);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      data: { status: "FAILED", attempts: { increment: 1 } },
    });
    expect(scheduleRetryMock).toHaveBeenCalledWith("evt-1");
    expect(updateMock.mock.invocationCallOrder[0]!).toBeLessThan(
      scheduleRetryMock.mock.invocationCallOrder[0]!
    );
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("endpoint=ep-1 event=evt-1"),
      expect.any(DOMException)
    );
  });
});

describe("dispatchWebhookEvent: fan-out", () => {
  it("delivers to every subscribed endpoint, one event row each", async () => {
    findManyMock.mockResolvedValue([endpoint("ep-1"), endpoint("ep-2"), endpoint("ep-3")]);

    await dispatchWebhookEvent(ORG, EVENT_TYPE, PAYLOAD);

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://receiver.test/ep-1",
      "https://receiver.test/ep-2",
      "https://receiver.test/ep-3",
    ]);
  });

  it("one endpoint failing does not stop or fail delivery to the others", async () => {
    findManyMock.mockResolvedValue([endpoint("ep-1"), endpoint("ep-2"), endpoint("ep-3")]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/ep-2")) throw new TypeError("fetch failed");
      return { ok: true, status: 200 };
    });

    await expect(dispatchWebhookEvent(ORG, EVENT_TYPE, PAYLOAD)).resolves.toBeUndefined();

    const statusByEvent = Object.fromEntries(
      updateMock.mock.calls.map((c) => {
        const arg = c[0] as { where: { id: string }; data: { status: string } };
        return [arg.where.id, arg.data.status];
      })
    );
    // createMock hands out evt-1, evt-2, ... in call order.
    const endpointByEvent: Record<string, string> = Object.fromEntries(
      createMock.mock.calls.map((c, i) => [
        `evt-${i + 1}`,
        (c[0] as { data: { endpointId: string } }).data.endpointId,
      ])
    );
    const statusByEndpoint = Object.fromEntries(
      Object.entries(statusByEvent).map(([evt, status]) => [endpointByEvent[evt], status])
    );
    expect(statusByEndpoint).toEqual({
      "ep-1": "DELIVERED",
      "ep-2": "FAILED",
      "ep-3": "DELIVERED",
    });
    expect(scheduleRetryMock).toHaveBeenCalledTimes(1);
  });

  it("resolves even when recording the event row itself fails (fire-and-forget contract)", async () => {
    findManyMock.mockResolvedValue([endpoint("ep-1"), endpoint("ep-2")]);
    createMock
      .mockRejectedValueOnce(new Error("db down"))
      .mockImplementationOnce(async () => ({ id: "evt-2" }));

    await expect(dispatchWebhookEvent(ORG, EVENT_TYPE, PAYLOAD)).resolves.toBeUndefined();

    // The endpoint whose row could not be recorded is not called (nothing to track it by);
    // the other one still is.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://receiver.test/ep-2");
  });
});
