import { randomUUID } from "node:crypto";

import { and, eq, gt, lte } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { authSessions, users } from "@/lib/database/schema";

export const AUTH_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

export async function issueAuthSession(
    userId: string,
    authenticatedGeneration: number,
    authenticatedPasswordChangedAt: number,
    now = new Date(),
) {
    const database = ensureDatabaseReady();
    const id = randomUUID();
    const expiresAt = new Date(now.getTime() + AUTH_SESSION_MAX_AGE_SECONDS * 1_000);

    return database.transaction(
        (tx) => {
            const currentUser = tx
                .select({
                    isDisabled: users.isDisabled,
                    authGeneration: users.authGeneration,
                    passwordChangedAt: users.passwordChangedAt,
                })
                .from(users)
                .where(eq(users.id, userId))
                .get();

            if (
                !currentUser ||
                currentUser.isDisabled ||
                currentUser.authGeneration !== authenticatedGeneration ||
                currentUser.passwordChangedAt.getTime() !== authenticatedPasswordChangedAt
            ) {
                return null;
            }

            tx.delete(authSessions).where(lte(authSessions.expiresAt, now)).run();
            tx.insert(authSessions)
                .values({
                    id,
                    userId,
                    authGeneration: authenticatedGeneration,
                    expiresAt,
                    createdAt: now,
                })
                .run();

            return { id, expiresAt };
        },
        { behavior: "immediate" },
    );
}

export async function isAuthSessionActive(
    sessionId: string,
    userId: string,
    authGeneration: number,
    now = new Date(),
) {
    const database = ensureDatabaseReady();
    const session = database
        .select({ id: authSessions.id })
        .from(authSessions)
        .where(
            and(
                eq(authSessions.id, sessionId),
                eq(authSessions.userId, userId),
                eq(authSessions.authGeneration, authGeneration),
                gt(authSessions.expiresAt, now),
            ),
        )
        .get();

    return session !== undefined;
}

export async function revokeAuthSession(sessionId: string, userId: string) {
    const database = ensureDatabaseReady();

    database
        .delete(authSessions)
        .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId)))
        .run();
}
