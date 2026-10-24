/**
 * Sign or verify an outbound webhook offline, for testing a receiver.
 *
 * Usage:
 *   pnpm webhook:tool sign --secret s3cret --event demo.ping --payload '{"hello":"world"}' --curl http://localhost:4000/hook
 *   pnpm webhook:tool verify --secret s3cret --body '<raw body>' --signature <hex>
 *
 * Logic lives in src/lib/webhooks/cli.ts so it can be unit-tested.
 */

import { runWebhookCli } from "../src/lib/webhooks/cli";

const result = runWebhookCli(process.argv.slice(2), process.env);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.code);
