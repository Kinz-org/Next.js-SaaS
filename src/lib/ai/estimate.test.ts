import { describe, expect, it } from "vitest";

import { AVAILABLE_MODELS, type ModelDefinition } from "@/config/models";
import { PLANS } from "@/lib/billing/plans";

import {
  estimate,
  formatUsd,
  monthlyCostUsd,
  renderTable,
  runCostEstimateCli,
  smallestFittingPlan,
} from "./estimate";

const PROFILE = { requestsPerMonth: 1000, avgInputTokens: 1500, avgOutputTokens: 500 };
const byName = (name: string) => {
  const model = AVAILABLE_MODELS.find((m) => m.modelName === name);
  if (!model) throw new Error(`model ${name} missing from AVAILABLE_MODELS`);
  return model;
};

describe("monthlyCostUsd", () => {
  it("prices input and output tokens separately per 1K", () => {
    const model = { inputCostPer1K: 0.002, outputCostPer1K: 0.01 } as ModelDefinition;
    // 1.5M input * 0.002/1K = 3.00, 0.5M output * 0.01/1K = 5.00
    expect(monthlyCostUsd(model, PROFILE)).toBeCloseTo(8, 10);
  });

  it("follows the prices in AVAILABLE_MODELS", () => {
    const m = byName("gpt-4o");
    expect(monthlyCostUsd(m, PROFILE)).toBeCloseTo(
      1500 * m.inputCostPer1K + 500 * m.outputCostPer1K,
      10
    );
  });

  it("is zero for free-tier models priced at zero", () => {
    expect(monthlyCostUsd(byName("gemini-2.0-flash"), PROFILE)).toBe(0);
  });
});

describe("smallestFittingPlan", () => {
  it("picks the first plan whose quota covers the tokens", () => {
    expect(smallestFittingPlan(PLANS.free.tokenQuota)).toBe("free");
    expect(smallestFittingPlan(PLANS.free.tokenQuota + 1)).toBe("starter");
    expect(smallestFittingPlan(PLANS.starter.tokenQuota + 1)).toBe("pro");
  });

  it("falls through to the unlimited plan above every finite quota", () => {
    expect(smallestFittingPlan(PLANS.pro.tokenQuota + 1)).toBe("enterprise");
  });
});

describe("estimate", () => {
  it("returns one entry per configured model and the total monthly tokens", () => {
    const result = estimate(PROFILE);
    expect(result.models).toHaveLength(AVAILABLE_MODELS.length);
    expect(result.tokensPerMonth).toBe(2_000_000);
    expect(result.plan).toBeNull();
    expect(result.models.every((m) => m.marginUsd === null)).toBe(true);
  });

  it("computes margin from the plan's monthly price in cents", () => {
    const result = estimate(PROFILE, "pro");
    const sonnet = result.models.find((m) => m.modelName === "claude-3-5-sonnet-latest")!;
    expect(result.plan?.priceUsd).toBe(PLANS.pro.priceMonthly / 100);
    expect(sonnet.marginUsd).toBeCloseTo(PLANS.pro.priceMonthly / 100 - sonnet.costUsd, 10);
    expect(result.plan?.exceedsQuota).toBe(false);
  });

  it("flags a plan whose quota is too small", () => {
    expect(estimate(PROFILE, "starter").plan?.exceedsQuota).toBe(true);
  });

  it("gives no margin for a contact-sales plan and never exceeds an unlimited quota", () => {
    const result = estimate(PROFILE, "enterprise");
    expect(result.plan?.priceUsd).toBeNull();
    expect(result.plan?.exceedsQuota).toBe(false);
    expect(result.models.every((m) => m.marginUsd === null)).toBe(true);
  });
});

describe("formatUsd", () => {
  it("rounds half-up to cents despite float noise", () => {
    expect(formatUsd(0.525)).toBe("$0.53");
    expect(formatUsd(150 * 0.00015 + 500 * 0.0006)).toBe("$0.32");
    expect(formatUsd(12)).toBe("$12.00");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(-3.5)).toBe("-$3.50");
  });
});

describe("renderTable", () => {
  it("shows each model's cost, the fitting plan and a quota warning", () => {
    const text = renderTable(estimate(PROFILE, "starter"));
    expect(text).toContain("2,000,000 tokens/month - fits the pro plan");
    for (const m of AVAILABLE_MODELS) expect(text).toContain(m.displayName);
    expect(text).toContain("Margin on starter");
    expect(text).toMatch(/WARNING: 2,000,000 tokens\/month exceed the starter quota of 500,000/);
  });
});

describe("runCostEstimateCli", () => {
  const base = ["--requests", "1000", "--input", "1500", "--output", "500"];

  it("prints a table and exits 0", () => {
    const res = runCostEstimateCli(base);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/GPT-4o\s+openai\s+\$8\.75/);
    expect(res.stdout).toMatch(/Claude 3\.5 Sonnet\s+anthropic\s+\$12\.00/);
  });

  it("prints parsable JSON with --json", () => {
    const res = runCostEstimateCli([...base, "--json"]);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.models).toHaveLength(AVAILABLE_MODELS.length);
    expect(typeof parsed.models[0].costUsd).toBe("number");
  });

  it.each([
    [["--requests", "-5", "--input", "1500", "--output", "500"], "non-negative"],
    [["--requests", "abc", "--input", "1500", "--output", "500"], "non-negative"],
    [["--requests", "1000", "--input", "1500"], "Missing --output"],
    [[...base, "--plan", "gold"], "Unknown plan: gold"],
    [[...base, "--model", "x"], "Unknown option: --model"],
    [[...base, "--plan"], "Missing value for --plan"],
  ])("rejects bad input %j", (args, message) => {
    const res = runCostEstimateCli(args as string[]);
    expect(res.code).not.toBe(0);
    expect(res.stdout).toBe("");
    expect(res.stderr).toContain(message);
    expect(res.stderr).toContain("Usage:");
  });
});
