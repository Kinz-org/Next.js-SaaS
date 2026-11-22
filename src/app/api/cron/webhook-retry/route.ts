import { NextRequest, NextResponse } from "next/server";
import { getEventsForRetry, scheduleRetry } from "@/lib/webhooks/retry";
import { prisma } from "@/lib/prisma";
import { signWebhook } from "@/lib/webhooks/signer";
import { safeCompare } from "@/lib/crypto";

/**
 * Cron job - retries failed outbound webhook deliveries.
 *
 * Runs every 5 min via Vercel Cron / Cloudflare Cron.
 * Schedule expression: "0-59/5 * * * *" (every 5 minutes)
 */

// getEventsForRetry() can return up to 50 events, each delivered with a 10s
// fetch timeout. Processed one at a time that's up to 500s of wall time -
// past typical serverless function limits, killing the batch mid-loop and
// starving whatever was left in the tail. Bounded concurrency (mirrors
// dispatcher.ts's Promise.allSettled fan-out, but capped rather than fully
// unbounded since this loop can span many distinct orgs/endpoints at once)
// keeps wall time low without hammering everything simultaneously.
const RETRY_CONCURRENCY = 10;

type RetryEvent = Awaited<ReturnType<typeof getEventsForRetry>>[number];
type RetryOutcome = { retried: boolean; succeeded: boolean };

async function retryOne(event: RetryEvent): Promise<RetryOutcome> {
  const endpoint = await prisma.webhookEndpoint.findUnique({
    where: { id: event.endpointId },
  });
  if (!endpoint || !endpoint.isActive) return { retried: false, succeeded: false };

  const body = JSON.stringify({
    event: event.eventType,
    payload: event.payload,
    timestamp: new Date().toISOString(),
    retry: true,
  });
  const signature = signWebhook(body, endpoint.secret);

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": event.eventType,
        "X-Webhook-Signature": signature,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    // A response was obtained (ok or not) - counts toward "retried", same
    // as before this refactor. A thrown/timed-out attempt (below) does not.
    if (response.ok) {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: "DELIVERED",
          responseCode: response.status,
          deliveredAt: new Date(),
          nextRetryAt: null,
        },
      });
      return { retried: true, succeeded: true };
    }

    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        responseCode: response.status,
        attempts: { increment: 1 },
      },
    });
    // Schedule the next attempt with exponential backoff, or mark the
    // event permanently failed once its retries (MAX_RETRIES in retry.ts) run out. Without
    // this, nextRetryAt keeps its stale past value and getEventsForRetry()
    // re-selects the event on every 5-minute tick forever - no backoff,
    // no cutoff. Mirrors dispatcher.ts's deliver().
    await scheduleRetry(event.id);
    return { retried: true, succeeded: false };
  } catch {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
      },
    });
    await scheduleRetry(event.id);
    return { retried: false, succeeded: false };
  }
}

/** Runs `worker` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runNext(): Promise<void> {
    const i = next++;
    const item = items[i];
    if (i >= items.length || item === undefined) return;
    results[i] = await worker(item);
    return runNext();
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
  return results;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader || !safeCompare(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await getEventsForRetry();
  const outcomes = await mapWithConcurrency(events, RETRY_CONCURRENCY, retryOne);

  const retried = outcomes.filter((o) => o.retried).length;
  const succeeded = outcomes.filter((o) => o.succeeded).length;

  return NextResponse.json({
    ok: true,
    retried,
    succeeded,
    timestamp: new Date().toISOString(),
  });
}
