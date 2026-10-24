import { signWebhook, verifySignature } from "./signer";
import { buildWebhookBody, webhookHeaders } from "./payload";

/**
 * Logic behind `pnpm webhook:tool` (scripts/webhook-tool.ts).
 *
 * Lets someone building a webhook receiver produce a correctly signed test event,
 * or check a signature, without running the app or a database. Kept free of
 * process/console access so it can be unit-tested.
 *
 *   pnpm webhook:tool sign --secret <s> --event <type> [--payload <json>] [--timestamp <iso>] [--curl <url>]
 *   pnpm webhook:tool verify --secret <s> --body <raw body> --signature <hex>
 */

export type CliResult = { code: number; stdout: string; stderr: string };

export const USAGE = `Usage:
  pnpm webhook:tool sign --secret <secret> --event <type> [--payload <json>] [--timestamp <iso>] [--curl <url>]
  pnpm webhook:tool verify --secret <secret> --body <raw body> --signature <hex>

--secret falls back to WEBHOOK_SIGNING_SECRET. Use the endpoint's own secret
(Dashboard > Settings > Webhooks) to match what the app sends to that endpoint.`;

export function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    flags[arg.slice(2)] = value;
    i++;
  }
  return flags;
}

/** Quote a string for a POSIX shell. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function curlCommand(
  url: string,
  eventType: string,
  body: string,
  signature: string
): string {
  const headers = Object.entries(webhookHeaders(eventType, signature))
    .map(([name, value]) => `  -H ${shellQuote(`${name}: ${value}`)} \\`)
    .join("\n");
  return `curl -sS -X POST ${shellQuote(url)} \\\n${headers}\n  --data-raw ${shellQuote(body)}`;
}

function sign(flags: Record<string, string>, secret: string): CliResult {
  const eventType = flags.event;
  if (!eventType) return fail("sign needs --event");

  let payload: unknown;
  try {
    payload = JSON.parse(flags.payload ?? "{}");
  } catch {
    return fail("--payload is not valid JSON");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return fail("--payload must be a JSON object");
  }

  const timestamp = flags.timestamp ? new Date(flags.timestamp) : new Date();
  if (Number.isNaN(timestamp.getTime())) return fail("--timestamp is not a valid date");

  const body = buildWebhookBody(eventType, payload as Record<string, unknown>, timestamp);
  const signature = signWebhook(body, secret);

  const lines = [`Body:      ${body}`, `Signature: ${signature}`];
  if (flags.curl) lines.push("", curlCommand(flags.curl, eventType, body, signature));
  return { code: 0, stdout: lines.join("\n") + "\n", stderr: "" };
}

function verify(flags: Record<string, string>, secret: string): CliResult {
  if (flags.body === undefined) return fail("verify needs --body");
  if (!flags.signature) return fail("verify needs --signature");
  return verifySignature(flags.body, flags.signature, secret)
    ? { code: 0, stdout: "valid: signature matches this body and secret\n", stderr: "" }
    : { code: 1, stdout: "", stderr: "invalid: signature does not match this body and secret\n" };
}

function fail(message: string): CliResult {
  return { code: 2, stdout: "", stderr: `${message}\n\n${USAGE}\n` };
}

export function runWebhookCli(
  argv: string[],
  env: Record<string, string | undefined> = {}
): CliResult {
  const [command, ...rest] = argv;
  if (command !== "sign" && command !== "verify")
    return fail(command ? `Unknown command: ${command}` : "Missing command");

  let flags: Record<string, string>;
  try {
    flags = parseFlags(rest);
  } catch (err) {
    return fail((err as Error).message);
  }

  const secret = flags.secret ?? env.WEBHOOK_SIGNING_SECRET;
  if (!secret) return fail("Missing --secret (or WEBHOOK_SIGNING_SECRET)");

  return command === "sign" ? sign(flags, secret) : verify(flags, secret);
}
