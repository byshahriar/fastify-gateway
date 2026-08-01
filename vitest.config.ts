import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src/", import.meta.url));
const testDir = fileURLToPath(new URL("./test/", import.meta.url));

export default defineConfig({
  resolve: {
    // Mirror the tsconfig `paths` aliases for imports resolved by vite.
    alias: [
      { find: /^@\//, replacement: srcDir },
      { find: /^@test\//, replacement: testDir },
    ],
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts", "src/types/**"],
      thresholds: {
        statements: 100,
        functions: 100,
        lines: 100,
        branches: 90,
      },
    },
  },
});
