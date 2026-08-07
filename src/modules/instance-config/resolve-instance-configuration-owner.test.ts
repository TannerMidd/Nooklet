import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";

import { resolveInstanceConfigurationOwnerId } from "./resolve-instance-configuration-owner";

function seedUser(role: "admin" | "user", isDisabled = false) {
    const id = randomUUID();

    ensureDatabaseReady()
        .insert(users)
        .values({
            id,
            email: `${id}@readiness.test`,
            displayName: role,
            passwordHash: "x",
            role,
            isDisabled,
        })
        .run();

    return id;
}

describe("resolveInstanceConfigurationOwnerId", () => {
    it("keeps every administrator on one stable configuration owner", async () => {
        const firstAdminId = seedUser("admin");
        const ownerId = await resolveInstanceConfigurationOwnerId(firstAdminId);
        const secondAdminId = seedUser("admin");

        expect(await resolveInstanceConfigurationOwnerId(secondAdminId)).toBe(ownerId);
    });

    it("lets regular users consume the active administrator configuration", async () => {
        seedUser("admin");
        const userId = seedUser("user");
        const resolvedId = await resolveInstanceConfigurationOwnerId(userId);
        const resolved = ensureDatabaseReady()
            .select()
            .from(users)
            .all()
            .find((user) => user.id === resolvedId);

        expect(resolved).toMatchObject({ role: "admin", isDisabled: false });
    });

    it("does not switch configuration when the owner is disabled or demoted", async () => {
        const ownerId = await resolveInstanceConfigurationOwnerId(seedUser("admin"));
        const otherAdminId = seedUser("admin");

        ensureDatabaseReady()
            .update(users)
            .set({ role: "user", isDisabled: true })
            .where(eq(users.id, ownerId))
            .run();

        expect(await resolveInstanceConfigurationOwnerId(otherAdminId)).toBe(ownerId);
    });
});
