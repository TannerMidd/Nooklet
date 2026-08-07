import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { envSchema, parseEnvironment, runtimeEnvKeys } from "./env";

const validEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    AUTH_SECRET: "auth-secret-material-that-is-long-and-unique-001",
    SECRET_BOX_KEY: "secret-box-material-that-is-long-and-unique-002",
    BOOTSTRAP_TOKEN: "bootstrap-token-material-that-is-long-and-unique-003",
};

describe("environment schema", () => {
    it("parses a minimal secure environment and applies runtime defaults", () => {
        const parsed = parseEnvironment(validEnvironment);

        expect(parsed.APP_URL).toBe("http://localhost:42021");
        expect(parsed.DATABASE_URL).toBe("file:./data/nooklet.db");
        expect(parsed.TRUST_PROXY_HEADERS).toBe(false);
        expect(parsed.OPERATIONAL_RETENTION_DAYS).toBe(365);
    });

    it.each([
        "ftp://example.com",
        "https://user:password@example.com",
        "https://example.com/nooklet",
        "https://example.com?tenant=one",
        "https://example.com/#fragment",
    ])("rejects APP_URL values that are not a plain HTTP(S) origin: %s", (APP_URL) => {
        expect(envSchema.safeParse({ ...validEnvironment, APP_URL }).success).toBe(false);
    });

    it("rejects non-SQLite database URLs and null-byte paths", () => {
        expect(
            envSchema.safeParse({ ...validEnvironment, DATABASE_URL: "postgres://db/app" }).success,
        ).toBe(false);
        expect(
            envSchema.safeParse({ ...validEnvironment, DOWNLOAD_ENGINE_DIR: "data\0escape" })
                .success,
        ).toBe(false);
    });

    it("requires active secrets to be independently generated", () => {
        const duplicated = "duplicate-secret-material-that-is-long-enough-001";
        const result = envSchema.safeParse({
            ...validEnvironment,
            AUTH_SECRET: duplicated,
            SECRET_BOX_KEY: duplicated,
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.issues).toEqual(
                expect.arrayContaining([expect.objectContaining({ path: ["SECRET_BOX_KEY"] })]),
            );
        }
    });

    it("rejects whitespace-padded values that do not contain enough secret material", () => {
        expect(
            envSchema.safeParse({
                ...validEnvironment,
                AUTH_SECRET: `short${" ".repeat(40)}`,
            }).success,
        ).toBe(false);
    });

    it("bounds operational record retention", () => {
        expect(
            envSchema.safeParse({
                ...validEnvironment,
                OPERATIONAL_RETENTION_DAYS: "29",
            }).success,
        ).toBe(false);
        expect(
            envSchema.safeParse({
                ...validEnvironment,
                OPERATIONAL_RETENTION_DAYS: "3651",
            }).success,
        ).toBe(false);
        expect(
            parseEnvironment({
                ...validEnvironment,
                OPERATIONAL_RETENTION_DAYS: "730",
            }).OPERATIONAL_RETENTION_DAYS,
        ).toBe(730);
    });
});

describe(".env.example parity", () => {
    it("documents every application runtime key and has no stale application keys", () => {
        const example = readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
        const exampleKeys = new Set(
            [...example.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]),
        );
        const systemManagedKeys = new Set(["NODE_ENV"]);
        const composeOnlyKeys = new Set(["APP_BIND_ADDRESS", "APP_PORT"]);
        const expectedRuntimeKeys = runtimeEnvKeys.filter((key) => !systemManagedKeys.has(key));

        expect([...expectedRuntimeKeys].filter((key) => !exampleKeys.has(key))).toEqual([]);
        expect(
            [...exampleKeys].filter(
                (key) =>
                    !runtimeEnvKeys.includes(key as (typeof runtimeEnvKeys)[number]) &&
                    !composeOnlyKeys.has(key),
            ),
        ).toEqual([]);
    });
});
