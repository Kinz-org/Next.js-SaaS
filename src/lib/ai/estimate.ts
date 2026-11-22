import { AVAILABLE_MODELS, type ModelDefinition } from "@/config/models";
import { PLANS, PLAN_ORDER, type PlanDefinition, type PlanSlug } from "@/lib/billing/plans";

/**
 * Logic behind `pnpm cost:estimate` (scripts/cost-estimate.ts).
 *
 * The /usage dashboard shows what tokens cost after they are spent. This answers the
 * question before launch: for a usage profile, what does each model cost per month,
 * which plan's token quota covers it, and how much of the plan price is left once the
 * LLM bill is paid. Prices come from AVAILABLE_MODELS and quotas/prices from PLANS, so
 * the estimate moves when those tables do. Kept free of process/console access so it
 * can be unit-tested.
 *
 *   pnpm cost:estimate --requests <per month> --input <avg tokens> --output <avg tokens> [--plan <slug>] [--json]
 */

export type UsageProfile = {
  requestsPerMonth: number;
  avgInputTokens: number;
  avgOutputTokens: number;
};

export type ModelEstimate = {
  provider: ModelDefinition["provider"];
  modelName: string;
  displayName: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Plan price minus LLM cost, in USD. Null without a plan or for contact-sales plans. */
  marginUsd: number | null;
};

export type Estimate = {
  profile: UsageProfile;
  tokensPerMonth: number;
  /** Smallest plan (in PLAN_ORDER) whose monthly token quota covers the profile. */
  fittingPlan: PlanSlug;
  plan: {
    slug: PlanSlug;
    priceUsd: number | null;
    tokenQuota: number;
    exceedsQuota: boolean;
  } | null;
  models: ModelEstimate[];
};

export type CliResult = { code: number; stdout: string; stderr: string };

export const USAGE = `Usage:
  pnpm cost:estimate --requests <per month> --input <avg input tokens> --output <avg output tokens> [--plan <${PLAN_ORDER.join("|")}>] [--json]

Prints the monthly LLM cost of that usage on every model in src/config/models.ts, the
smallest plan in src/lib/billing/plans.ts whose token quota covers it and, with --plan,
the margin left from that plan's monthly price.`;

/** Cost in USD of one month of `profile` on `model`, from its per-1K-token prices. */
export function monthlyCostUsd(model: ModelDefinition, profile: UsageProfile): number {
  const inputTokens = profile.requestsPerMonth * profile.avgInputTokens;
  const outputTokens = profile.requestsPerMonth * profile.avgOutputTokens;
  return (
    (inputTokens / 1000) * model.inputCostPer1K + (outputTokens / 1000) * model.outputCostPer1K
  );
}

/** Smallest plan whose quota covers `tokens` (-1 quota means unlimited). */
export function smallestFittingPlan(
  tokens: number,
  plans: Record<PlanSlug, PlanDefinition> = PLANS,
  order: PlanSlug[] = PLAN_ORDER
): PlanSlug {
  const fit = order.find(
    (slug) => plans[slug].tokenQuota === -1 || plans[slug].tokenQuota >= tokens
  );
  // Every real plan table ends with an unlimited plan; fall back to the last one anyway.
  return fit ?? order[order.length - 1]!;
}

export function estimate(
  profile: UsageProfile,
  planSlug?: PlanSlug,
  models: ModelDefinition[] = AVAILABLE_MODELS,
  plans: Record<PlanSlug, PlanDefinition> = PLANS
): Estimate {
  const tokensPerMonth =
    profile.requestsPerMonth * (profile.avgInputTokens + profile.avgOutputTokens);

  let plan: Estimate["plan"] = null;
  if (planSlug) {
    const def = plans[planSlug];
    plan = {
      slug: planSlug,
      // priceMonthly is in cents; -1 means contact sales.
      priceUsd: def.priceMonthly < 0 ? null : def.priceMonthly / 100,
      tokenQuota: def.tokenQuota,
      exceedsQuota: def.tokenQuota !== -1 && tokensPerMonth > def.tokenQuota,
    };
  }

  return {
    profile,
    tokensPerMonth,
    fittingPlan: smallestFittingPlan(tokensPerMonth, plans),
    plan,
    models: models.map((m) => {
      const costUsd = monthlyCostUsd(m, profile);
      return {
        provider: m.provider,
        modelName: m.modelName,
        displayName: m.displayName,
        inputTokens: profile.requestsPerMonth * profile.avgInputTokens,
        outputTokens: profile.requestsPerMonth * profile.avgOutputTokens,
        costUsd,
        marginUsd: plan?.priceUsd == null ? null : plan.priceUsd - costUsd,
      };
    }),
  };
}

export function formatUsd(value: number): string {
  // Round half-up through integer cents. Trimming to 6 decimals first absorbs float noise
  // such as 0.525 being computed as 0.52499999…, which would otherwise round down.
  const cents = Math.round(Number((Math.abs(value) * 100).toFixed(6)));
  const text = `$${(cents / 100).toFixed(2)}`;
  return value < 0 && cents !== 0 ? `-${text}` : text;
}

const fmtInt = (n: number) => n.toLocaleString("en-US");
const fmtQuota = (n: number) => (n === -1 ? "unlimited" : fmtInt(n));

export function renderTable(result: Estimate): string {
  const header = ["Model", "Provider", "Cost / month"];
  if (result.plan) header.push(`Margin on ${result.plan.slug}`);

  const rows = result.models.map((m) => {
    const row = [m.displayName, m.provider, formatUsd(m.costUsd)];
    if (result.plan) row.push(m.marginUsd === null ? "n/a" : formatUsd(m.marginUsd));
    return row;
  });

  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (i >= 2 ? c.padStart(widths[i]!) : c.padEnd(widths[i]!))).join("  ");

  const { profile } = result;
  const out = [
    `Profile: ${fmtInt(profile.requestsPerMonth)} requests/month × (${fmtInt(profile.avgInputTokens)} input + ${fmtInt(profile.avgOutputTokens)} output tokens)`,
    `Tokens:  ${fmtInt(result.tokensPerMonth)} tokens/month - fits the ${result.fittingPlan} plan (quota ${fmtQuota(PLANS[result.fittingPlan].tokenQuota)})`,
    "",
    line(header),
    line(widths.map((w) => "-".repeat(w))),
    ...rows.map(line),
  ];

  if (result.plan) {
    out.push("");
    if (result.plan.priceUsd === null) {
      out.push(`The ${result.plan.slug} plan is contact-sales, so no margin is computed.`);
    } else {
      out.push(
        `Margin = ${result.plan.slug} price ${formatUsd(result.plan.priceUsd)}/month minus the LLM cost.`
      );
    }
    if (result.plan.exceedsQuota) {
      out.push(
        `WARNING: ${fmtInt(result.tokensPerMonth)} tokens/month exceed the ${result.plan.slug} quota of ${fmtInt(result.plan.tokenQuota)}; checkBudget() would block requests once it is used up.`
      );
    }
  }
  return out.join("\n") + "\n";
}

export function parseArgs(args: string[]): { flags: Record<string, string>; json: boolean } {
  const flags: Record<string, string> = {};
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    flags[arg.slice(2)] = value;
    i++;
  }
  return { flags, json };
}

function readCount(flags: Record<string, string>, name: string): number {
  const raw = flags[name];
  if (raw === undefined) throw new Error(`Missing --${name}`);
  const value = Number(raw.replace(/_/g, ""));
  if (!Number.isFinite(value) || value < 0 || !/^[0-9_]+(\.[0-9]+)?$/.test(raw)) {
    throw new Error(`--${name} must be a non-negative number, got "${raw}"`);
  }
  return value;
}

function fail(message: string): CliResult {
  return { code: 2, stdout: "", stderr: `${message}\n\n${USAGE}\n` };
}

export function runCostEstimateCli(argv: string[]): CliResult {
  let profile: UsageProfile;
  let planSlug: PlanSlug | undefined;
  let json: boolean;
  try {
    const parsed = parseArgs(argv);
    json = parsed.json;
    const known = new Set(["requests", "input", "output", "plan"]);
    const unknown = Object.keys(parsed.flags).find((k) => !known.has(k));
    if (unknown) throw new Error(`Unknown option: --${unknown}`);
    profile = {
      requestsPerMonth: readCount(parsed.flags, "requests"),
      avgInputTokens: readCount(parsed.flags, "input"),
      avgOutputTokens: readCount(parsed.flags, "output"),
    };
    if (parsed.flags.plan !== undefined) {
      if (!(PLAN_ORDER as string[]).includes(parsed.flags.plan)) {
        throw new Error(`Unknown plan: ${parsed.flags.plan} (expected ${PLAN_ORDER.join(", ")})`);
      }
      planSlug = parsed.flags.plan as PlanSlug;
    }
  } catch (err) {
    return fail((err as Error).message);
  }

  const result = estimate(profile, planSlug);
  const stdout = json ? JSON.stringify(result, null, 2) + "\n" : renderTable(result);
  return { code: 0, stdout, stderr: "" };
}
