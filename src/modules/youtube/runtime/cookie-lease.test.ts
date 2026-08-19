import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createYouTubeCookieLeaseFromText } from "./cookie-lease";

describe("YouTube cookie file leases", () => {
    it("materializes a private per-process file and removes it idempotently", async () => {
        const lease = await createYouTubeCookieLeaseFromText("secret-cookie-material\n");

        await expect(readFile(lease.path, "utf8")).resolves.toBe("secret-cookie-material\n");
        await lease.release();
        await lease.release();
        await expect(access(lease.path)).rejects.toThrow();
    });
});
