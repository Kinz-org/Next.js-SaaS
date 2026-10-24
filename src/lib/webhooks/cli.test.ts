import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { runWebhookCli, shellQuote, parseFlags } from "@/lib/webhooks/cli";
import { buildWebhookBody } from "@/lib/webhooks/payload";

const secret = "s3cret"; // gitleaks:allow - test fixture, not a real secret
const timestamp = "2026-01-01T00:00:00.000Z";
const expectedBody = `{"event":"demo.ping","payload":{"hello":"world"},"timestamp":"${timestamp}"}`;

function signArgs(...extra: string[]) {
  return [
    "sign",
    "--secret",
    secret,
    "--event",
    "demo.ping",
    "--payload",
    '{"hello":"world"}',
    "--timestamp",
    timestamp,
    ...extra,
  ];
}

function field(stdout: string, name: string): string {
  const line = stdout.split("\n").find((l) => l.startsWith(`${name}:`));
  return line!.slice(name.length + 1).trim();
}

describe("webhooks/cli", () => {
  it("sign prints the dispatcher's body shape and its HMAC-SHA256", () => {
    const result = runWebhookCli(signArgs());
    expect(result.code).toBe(0);
    expect(field(result.stdout, "Body")).toBe(expectedBody);
    const expectedSig = crypto.createHmac("sha256", secret).update(expectedBody).digest("hex");
    expect(field(result.stdout, "Signature")).toBe(expectedSig);
  });

  it("builds the same body as buildWebhookBody, which the dispatcher uses", () => {
    const body = buildWebhookBody("demo.ping", { hello: "world" }, new Date(timestamp));
    expect(body).toBe(expectedBody);
  });

  it("verify accepts a signature from sign and rejects a wrong secret", () => {
    const signed = runWebhookCli(signArgs()).stdout;
    const body = field(signed, "Body");
    const signature = field(signed, "Signature");

    const ok = runWebhookCli([
      "verify",
      "--secret",
      secret,
      "--body",
      body,
      "--signature",
      signature,
    ]);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toMatch(/^valid/);

    const bad = runWebhookCli([
      "verify",
      "--secret",
      "wrong",
      "--body",
      body,
      "--signature",
      signature,
    ]);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toMatch(/^invalid/);
  });

  it("--curl prints a command with the dispatcher's headers that a shell runs as intended", () => {
    const result = runWebhookCli(signArgs("--curl", "http://localhost:4000/hook"));
    const signature = field(result.stdout, "Signature");
    const curl = result.stdout.slice(result.stdout.indexOf("curl "));
    expect(curl).toContain("'http://localhost:4000/hook'");
    expect(curl).toContain("-H 'Content-Type: application/json'");
    expect(curl).toContain("-H 'X-Webhook-Event: demo.ping'");
    expect(curl).toContain(`-H 'X-Webhook-Signature: ${signature}'`);

    // Swap curl for printf to see exactly what the shell would hand it as --data-raw.
    const dataRaw = curl.slice(curl.indexOf("--data-raw ") + "--data-raw ".length);
    const echoed = execFileSync("sh", ["-c", `printf '%s' ${dataRaw}`]).toString();
    expect(echoed).toBe(expectedBody);
  });

  it("shellQuote survives single quotes in the payload", () => {
    const value = `{"name":"O'Brien"}`;
    expect(execFileSync("sh", ["-c", `printf '%s' ${shellQuote(value)}`]).toString()).toBe(value);
  });

  it("falls back to WEBHOOK_SIGNING_SECRET when --secret is omitted", () => {
    const withFlag = runWebhookCli(signArgs());
    const fromEnv = runWebhookCli(
      ["sign", "--event", "demo.ping", "--payload", '{"hello":"world"}', "--timestamp", timestamp],
      { WEBHOOK_SIGNING_SECRET: secret }
    );
    expect(fromEnv.stdout).toBe(withFlag.stdout);
  });

  it("rejects bad input with exit code 2 and the usage text", () => {
    for (const argv of [
      [],
      ["frobnicate"],
      ["sign", "--event", "x"],
      ["sign", "--secret", secret],
      ["sign", "--secret", secret, "--event", "x", "--payload", "not json"],
      ["sign", "--secret", secret, "--event", "x", "--payload", "[1,2]"],
      ["sign", "--secret", secret, "--event", "x", "--timestamp", "yesterday"],
      ["verify", "--secret", secret, "--body", "{}"],
    ]) {
      const result = runWebhookCli(argv);
      expect(result.code, argv.join(" ")).toBe(2);
      expect(result.stderr).toContain("Usage:");
    }
  });

  it("parseFlags refuses a flag without a value", () => {
    expect(() => parseFlags(["--secret"])).toThrow(/Missing value/);
    expect(() => parseFlags(["--secret", "--event", "x"])).toThrow(/Missing value/);
  });
});
