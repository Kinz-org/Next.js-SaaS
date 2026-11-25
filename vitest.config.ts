import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      // `pnpm test:coverage`. Off for plain `pnpm test`, so CI is unchanged.
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      reporter: ["text-summary", "text", "html"],
      reportsDirectory: "coverage",
    },
    server: {
      deps: {
        // Prisma 7's @prisma/client does `require(".prisma/client/default")`.
        // Vite's resolver does not handle that leading-dot package name under
        // pnpm's nested store layout and fails with
        //   Cannot find module '.prisma/client/default'
        // Node's own resolver walks up to node_modules/.pnpm/@prisma+client@*/
        // node_modules/.prisma and finds it, so keep these external and let
        // Node do the resolving.
        external: [/@prisma\/client/, /\.prisma/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
