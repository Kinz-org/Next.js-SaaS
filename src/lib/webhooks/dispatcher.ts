import { prisma } from "@/lib/prisma";
import { signWebhook } from "./signer";
import { scheduleRetry } from "./retry";
import { buildWebhookBody, webhookHeaders } from "./payload";

/**
 * Outbound webhook dispatcher.
 *
 * Fires webhook events to all active WebhookEndpoints subscribed to the event.
 * Each delivery is recorded as a WebhookEvent for retry tracking.
 *
 * Called from anywhere in the app:
 *   await dispatchWebhookEvent(orgId, "conversation.created", { conversation });
 */

export async function dispatchWebhookEvent(
  organizationId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  // 1. Find all active endpoints subscribed to this event
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      organizationId,
      isActive: true,
      events: { has: eventType },
    },
  });

  if (endpoints.length === 0) return;

  const body = buildWebhookBody(eventType, payload);

  // 2. Dispatch to each endpoint (parallel, fire-and-forget)
  await Promise.allSettled(
    endpoints.map((endpoint) =>
      deliver(endpoint.id, endpoint.url, endpoint.secret, body, eventType)
    )
  );
}

async function deliver(
  endpointId: string,
  url: string,
  secret: string,
  body: string,
  eventType: string
): Promise<void> {
  const signature = signWebhook(body, secret);

  // Record the WebhookEvent (pending status)
  const event = await prisma.webhookEvent.create({
    data: {
      endpointId,
      eventType,
      payload: JSON.parse(body),
      status: "PENDING",
    },
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: webhookHeaders(eventType, signature),
      body,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (response.ok) {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: "DELIVERED",
          responseCode: response.status,
          deliveredAt: new Date(),
        },
      });
    } else {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          responseCode: response.status,
          attempts: { increment: 1 },
        },
      });
      await scheduleRetry(event.id);
    }
  } catch (err) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        // Note: error message is logged to console, not stored (no metadata column)
      },
    });
    console.error(`[WEBHOOK DELIVERY FAILED] endpoint=${endpointId} event=${event.id}`, err);
    await scheduleRetry(event.id);
  }
}
