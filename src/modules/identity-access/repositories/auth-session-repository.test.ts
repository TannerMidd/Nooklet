import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
    createUser,
    updateUserDisabledStateGuarded,
    updateUserPassword,
} from "@/modules/users/repositories/user-repository";

import {
    isAuthSessionActive,
    issueAuthSession,
    revokeAuthSession,
} from "./auth-session-repository";

async function createTestUser(role: "admin" | "user" = "user") {
    const id = randomUUID();
    const user = await createUser({
        email: `${id}@nooklet.test`,
        displayName: "Session Test User",
        passwordHash: "not-a-real-password-hash",
        role,
    });

    if (!user) {
        throw new Error("Test user was not created.");
    }

    return user;
}

async function issueForUser(user: Awaited<ReturnType<typeof createTestUser>>, now: Date) {
    const session = await issueAuthSession(
        user.id,
        user.authGeneration,
        user.passwordChangedAt.getTime(),
        now,
    );

    if (!session) {
        throw new Error("Expected the test session to be issued.");
    }

    return session;
}

describe("auth-session-repository", () => {
    it("issues an absolute-lifetime session and revokes it by user and id", async () => {
        const user = await createTestUser();
        const issuedAt = new Date("2026-08-07T03:00:00.000Z");
        const session = await issueForUser(user, issuedAt);

        await expect(
            isAuthSessionActive(
                session.id,
                user.id,
                user.authGeneration,
                new Date("2026-08-08T02:59:59.999Z"),
            ),
        ).resolves.toBe(true);
        await expect(
            isAuthSessionActive(
                session.id,
                user.id,
                user.authGeneration,
                new Date("2026-08-08T03:00:00.000Z"),
            ),
        ).resolves.toBe(false);

        await revokeAuthSession(session.id, user.id);
        await expect(
            isAuthSessionActive(session.id, user.id, user.authGeneration, issuedAt),
        ).resolves.toBe(false);
    });

    it("does not let one user revoke another user's session", async () => {
        const owner = await createTestUser();
        const otherUser = await createTestUser();
        const now = new Date("2026-08-07T03:00:00.000Z");
        const session = await issueForUser(owner, now);

        await revokeAuthSession(session.id, otherUser.id);

        await expect(
            isAuthSessionActive(session.id, owner.id, owner.authGeneration, now),
        ).resolves.toBe(true);
    });

    it("revokes every active session atomically when an administrator disables a user", async () => {
        const actor = await createTestUser("admin");
        const target = await createTestUser();
        const now = new Date("2026-08-07T03:00:00.000Z");
        const session = await issueForUser(target, now);

        await expect(
            updateUserDisabledStateGuarded(actor.id, target.id, true),
        ).resolves.toMatchObject({
            status: "updated",
            user: { id: target.id, isDisabled: true },
        });
        await expect(
            isAuthSessionActive(session.id, target.id, target.authGeneration, now),
        ).resolves.toBe(false);
    });

    it("rejects a pending login after disablement and re-enablement", async () => {
        const actor = await createTestUser("admin");
        const target = await createTestUser();
        const authenticatedGeneration = target.authGeneration;
        const authenticatedPasswordChangedAt = target.passwordChangedAt.getTime();

        await updateUserDisabledStateGuarded(actor.id, target.id, true);
        await updateUserDisabledStateGuarded(actor.id, target.id, false);

        await expect(
            issueAuthSession(target.id, authenticatedGeneration, authenticatedPasswordChangedAt),
        ).resolves.toBeNull();
    });

    it("invalidates active and pending sessions in the password-update transaction", async () => {
        const target = await createTestUser();
        const now = new Date("2026-08-07T03:00:00.000Z");
        const activeSession = await issueForUser(target, now);

        const updated = await updateUserPassword(target.id, "replacement-password-hash");

        expect(updated?.authGeneration).toBe(target.authGeneration + 1);
        await expect(
            isAuthSessionActive(activeSession.id, target.id, target.authGeneration, now),
        ).resolves.toBe(false);
        await expect(
            issueAuthSession(
                target.id,
                target.authGeneration,
                target.passwordChangedAt.getTime(),
                now,
            ),
        ).resolves.toBeNull();
    });
});
