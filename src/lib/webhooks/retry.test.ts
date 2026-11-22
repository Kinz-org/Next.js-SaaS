import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

// Direct tests for the backoff ladder. route.test.ts and dispatcher.test.ts
// both mock scheduleRetry(), so until this file the ladder, the jitter and
// the give-up branch never actually ran under test.
//
// Callers increment `attempts` *before* calling scheduleRetry(), so when it
// runs `attempts` is the number of failed deliveries so far (>= 1).

const findUniqueMock: Mock = vi.fn();
const updateMock: Mock = vi.fn().mockResolvedValue({});
const findManyMock: Mock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
      update: (...a: unknown[]) => updateMock(...a),
      findMany: (...a: unknown[]) => findManyMock(...a),
    },
  },
}));

const { scheduleRetry, getEventsForRetry } = await import("./retry");

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
// The ladder documented in retry.ts: 1m, 5m, 30m, 2h, 6h, 24h, give up.
const LADDER = [1 * MIN, 5 * MIN, 30 * MIN, 2 * HOUR, 6 * HOUR, 24 * HOUR];
const NOW = new Date("2026-11-18T00:00:00Z").getTime();

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  updateMock.mockResolvedValue({});
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function scheduledDelay(): number {
  expect(updateMock).toHaveBeenCalledTimes(1);
  const { data } = updateMock.mock.calls[0]![0] as { data: { nextRetryAt: Date } };
  return data.nextRetryAt.getTime() - NOW;
}

describe("scheduleRetry", () => {
  it("does nothing when the event no longer exists", async () => {
    findUniqueMock.mockResolvedValue(null);
    await scheduleRetry("evt-missing");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it.each(LADDER.map((ms, i) => [i + 1, ms] as const))(
    "after %i failed attempt(s) waits the ladder step exactly when jitter is zero",
    async (attempts, expectedMs) => {
      vi.spyOn(Math, "random").mockReturnValue(0.5); // (0.5 - 0.5) -> no jitter
      findUniqueMock.mockResolvedValue({ attempts });
      await scheduleRetry("evt-1");
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: "evt-1" },
        data: { nextRetryAt: new Date(NOW + expectedMs) },
      });
      expect(warnSpy).not.toHaveBeenCalled();
    },
  );

  it("reaches the documented 24h step before giving up (6 retries, ~33h)", async () => {
    // Regression: the give-up check used `attempts >= 6`, so the 6th failure
    // gave up and the 24h step was unreachable — 5 retries over ~8.6h
    // instead of the 6 over ~33h the docs promise.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    findUniqueMock.mockResolvedValue({ attempts: 6 });
    await scheduleRetry("evt-1");
    expect(scheduledDelay()).toBe(24 * HOUR);
    const total = LADDER.reduce((a, b) => a + b, 0);
    expect(total / HOUR).toBeCloseTo(32.6, 1);
  });

  it("keeps jitter within ±20% of the step", async () => {
    findUniqueMock.mockResolvedValue({ attempts: 3 }); // 30 min step
    vi.spyOn(Math, "random").mockReturnValue(0);
    await scheduleRetry("evt-1");
    expect(scheduledDelay()).toBe(30 * MIN * 0.8);

    updateMock.mockClear();
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    await scheduleRetry("evt-1");
    const high = scheduledDelay();
    expect(high).toBeLessThanOrEqual(30 * MIN * 1.2);
    expect(high).toBeGreaterThan(30 * MIN * 1.19);
  });

  it("falls back to the first step when attempts is 0", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    findUniqueMock.mockResolvedValue({ attempts: 0 });
    await scheduleRetry("evt-1");
    expect(scheduledDelay()).toBe(1 * MIN);
  });

  it.each([7, 8, 50])(
    "after %i failed attempts marks the event permanently failed",
    async (attempts) => {
      findUniqueMock.mockResolvedValue({ attempts });
      await scheduleRetry("evt-dead");
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: "evt-dead" },
        data: { status: "FAILED", nextRetryAt: null },
      });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("event=evt-dead"));
    },
  );
});

describe("getEventsForRetry", () => {
  it("asks for due FAILED events, oldest first, in batches of 50", async () => {
    findManyMock.mockResolvedValue([]);
    await getEventsForRetry();
    expect(findManyMock).toHaveBeenCalledWith({
      where: { status: "FAILED", nextRetryAt: { lte: new Date(NOW) } },
      take: 50,
      orderBy: { nextRetryAt: "asc" },
    });
  });

  it("returns only the fields the cron needs", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "evt-1",
        endpointId: "ep-1",
        eventType: "conversation.created",
        payload: { a: 1 },
        status: "FAILED",
        attempts: 2,
        responseCode: 503,
      },
    ]);
    await expect(getEventsForRetry()).resolves.toEqual([
      { id: "evt-1", endpointId: "ep-1", eventType: "conversation.created", payload: { a: 1 } },
    ]);
  });
});
