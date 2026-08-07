import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    test: {
        pool: "forks",
        setupFiles: ["./vitest.setup.ts"],
        // Browser E2E specs and Node-native script tests use their own runners.
        // Keeping Vitest scoped to application tests prevents incompatible suites
        // from being collected as part of `npm test`.
        include: ["src/**/*.test.{ts,tsx}"],
        // Exclude build artifacts so a stale copy of the source under .next/
        // (produced by `next build`) is not collected as duplicate test files.
        exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "**/.next/**",
            "**/.{idea,git,cache,output,temp}/**",
        ],
    },
});
