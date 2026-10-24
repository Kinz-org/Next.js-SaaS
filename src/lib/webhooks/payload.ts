/**
 * Wire format of outbound webhooks.
 *
 * Shared by lib/webhooks/dispatcher.ts (real deliveries) and lib/webhooks/cli.ts
 * (`pnpm webhook:tool`), so a test event built by the CLI is byte-for-byte what a
 * receiver gets from the app.
 */

export function buildWebhookBody(
  eventType: string,
  payload: Record<string, unknown>,
  timestamp: Date = new Date()
): string {
  return JSON.stringify({ event: eventType, payload, timestamp: timestamp.toISOString() });
}

export function webhookHeaders(eventType: string, signature: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Webhook-Event": eventType,
    "X-Webhook-Signature": signature,
  };
}
