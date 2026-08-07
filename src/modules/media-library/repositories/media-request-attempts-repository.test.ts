import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { mediaRequestAttempts, users } from "@/lib/database/schema";

import {
    acquireMediaRequestAttempt,
    DEFAULT_REQUEST_ATTEMPT_TTL_MS,
    FULL_SEASON_REQUEST_ATTEMPT_TTL_MS,
    releaseMediaRequestAttempt,
    renewMediaRequestAttempt,
} from "./media-request-attempts-repository";

function seedUser() {
    const database = ensureDatabaseReady();
    const userId = randomUUID();

    database
        .insert(users)
        .values({
            id: userId,
            email: `${userId}@test.local`,
            displayName: "Lease Test",
            passwordHash: "x",
            role: "user",
        })
        .run();

    return userId;
}

describe("media-request-attempts-repository", () => {
    it("uses a lease long enough for full-season request expansion", () => {
        expect(DEFAULT_REQUEST_ATTEMPT_TTL_MS).toBeGreaterThanOrEqual(5 * 60_000);
        expect(FULL_SEASON_REQUEST_ATTEMPT_TTL_MS).toBeGreaterThanOrEqual(2 * 60 * 60_000);
    });

    it("does not let an expired owner release its replacement's lease", async () => {
        const database = ensureDatabaseReady();
        const userId = seedUser();
        const requestKey = `season:${randomUUID()}`;
        const first = await acquireMediaRequestAttempt(userId, requestKey, 60_000);

        expect(first).not.toBeNull();

        if (!first) {
            throw new Error("first lease missing");
        }

        await expect(acquireMediaRequestAttempt(userId, requestKey, 60_000)).resolves.toBeNull();
        database
            .update(mediaRequestAttempts)
            .set({ expiresAt: new Date(Date.now() - 1) })
            .where(eq(mediaRequestAttempts.id, first.id))
            .run();

        const replacement = await acquireMediaRequestAttempt(userId, requestKey, 60_000);

        expect(replacement).not.toBeNull();

        if (!replacement) {
            throw new Error("replacement lease missing");
        }

        expect(replacement.id).not.toBe(first.id);

        await expect(releaseMediaRequestAttempt(first)).resolves.toBe(false);
        expect(
            database
                .select()
                .from(mediaRequestAttempts)
                .where(eq(mediaRequestAttempts.id, replacement.id))
                .get()?.requestKey,
        ).toBe(requestKey);

        await expect(releaseMediaRequestAttempt(replacement)).resolves.toBe(true);
        expect(
            database
                .select()
                .from(mediaRequestAttempts)
                .where(eq(mediaRequestAttempts.id, replacement.id))
                .get(),
        ).toBeUndefined();
    });

    it("rejects invalid lease durations", async () => {
        const userId = seedUser();

        await expect(acquireMediaRequestAttempt(userId, "invalid-ttl", 0)).rejects.toThrow(
            /positive integer/i,
        );
        const lease = await acquireMediaRequestAttempt(userId, "invalid-renew-ttl", 60_000);

        if (!lease) {
            throw new Error("lease missing");
        }

        await expect(renewMediaRequestAttempt(lease, 0)).rejects.toThrow(/positive integer/i);
    });

    it("renews only a live lease owned by the same token", async () => {
        const database = ensureDatabaseReady();
        const userId = seedUser();
        const lease = await acquireMediaRequestAttempt(userId, `renew:${randomUUID()}`, 60_000);

        if (!lease) {
            throw new Error("lease missing");
        }

        const renewed = await renewMediaRequestAttempt(lease, 120_000);

        expect(renewed?.expiresAt.getTime()).toBeGreaterThan(lease.expiresAt.getTime());

        database
            .update(mediaRequestAttempts)
            .set({ expiresAt: new Date(Date.now() - 1) })
            .where(eq(mediaRequestAttempts.id, lease.id))
            .run();

        await expect(renewMediaRequestAttempt(lease, 120_000)).resolves.toBeNull();
    });
});
