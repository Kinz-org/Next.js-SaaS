/**
 * Estimate the monthly LLM cost of a usage profile on every configured model, offline.
 *
 * Usage:
 *   pnpm cost:estimate --requests 1000 --input 1500 --output 500
 *   pnpm cost:estimate --requests 1000 --input 1500 --output 500 --plan pro
 *   pnpm cost:estimate --requests 1000 --input 1500 --output 500 --json
 *
 * Logic lives in src/lib/ai/estimate.ts so it can be unit-tested.
 */

import { runCostEstimateCli } from "../src/lib/ai/estimate";

const result = runCostEstimateCli(process.argv.slice(2));
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.code);
