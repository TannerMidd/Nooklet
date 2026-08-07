import { randomUUID } from "node:crypto";

import { and, count, desc, eq, sql } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, authSessions, users, type UserRole } from "@/lib/database/schema";
import { buildAuditPayload } from "@/lib/security/audit-payload";

function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

export async function countAdminUsers() {
    const database = ensureDatabaseReady();
    const result = database
        .select({ count: count() })
        .from(users)
        .where(eq(users.role, "admin"))
        .get();

    return result?.count ?? 0;
}

export async function countActiveAdminUsers() {
    const database = ensureDatabaseReady();
    const result = database
        .select({ count: count() })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.isDisabled, false)))
        .get();

    return result?.count ?? 0;
}

export async function findUserByEmail(email: string) {
    const database = ensureDatabaseReady();

    return (
        database
            .select()
            .from(users)
            .where(eq(users.email, normalizeEmail(email)))
            .get() ?? null
    );
}

export async function findUserById(userId: string) {
    const database = ensureDatabaseReady();

    return database.select().from(users).where(eq(users.id, userId)).get() ?? null;
}

export async function listUsers() {
    const database = ensureDatabaseReady();

    return database.select().from(users).orderBy(desc(users.createdAt)).all();
}

type CreateUserInput = {
    email: string;
    displayName: string;
    passwordHash: string;
    role: UserRole;
    mustChangePassword?: boolean;
};

export async function createUser(input: CreateUserInput) {
    const database = ensureDatabaseReady();
    const id = randomUUID();

    database
        .insert(users)
        .values({
            id,
            email: normalizeEmail(input.email),
            displayName: input.displayName,
            passwordHash: input.passwordHash,
            role: input.role,
            mustChangePassword: input.mustChangePassword ?? false,
        })
        .run();

    return database.select().from(users).where(eq(users.id, id)).get() ?? null;
}

export async function updateUserPassword(
    userId: string,
    passwordHash: string,
    options: { mustChangePassword?: boolean } = {},
) {
    const database = ensureDatabaseReady();
    const now = new Date();
    const passwordState =
        typeof options.mustChangePassword === "boolean"
            ? { mustChangePassword: options.mustChangePassword }
            : {};

    return database.transaction(
        (tx) => {
            tx.update(users)
                .set({
                    passwordHash,
                    ...passwordState,
                    passwordChangedAt: now,
                    authGeneration: sql`${users.authGeneration} + 1`,
                    failedLoginAttempts: 0,
                    lockedUntil: null,
                    updatedAt: now,
                })
                .where(eq(users.id, userId))
                .run();
            tx.delete(authSessions).where(eq(authSessions.userId, userId)).run();

            return tx.select().from(users).where(eq(users.id, userId)).get() ?? null;
        },
        { behavior: "immediate" },
    );
}

export async function recordFailedLogin(userId: string) {
    const database = ensureDatabaseReady();
    const now = new Date();

    return database.transaction((tx) => {
        const user = tx.select().from(users).where(eq(users.id, userId)).get();

        if (!user) {
            return null;
        }

        const nextAttempts = (user.failedLoginAttempts ?? 0) + 1;

        tx.update(users)
            .set({
                failedLoginAttempts: nextAttempts,
                updatedAt: now,
            })
            .where(eq(users.id, userId))
            .run();

        return { attempts: nextAttempts };
    });
}

export async function clearFailedLogins(userId: string) {
    const database = ensureDatabaseReady();

    database
        .update(users)
        .set({
            failedLoginAttempts: 0,
            lockedUntil: null,
            updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .run();
}

type GuardedUserUpdateResult =
    | {
          status: "updated";
          user: typeof users.$inferSelect;
          previousUser: typeof users.$inferSelect;
      }
    | { status: "unchanged"; user: typeof users.$inferSelect }
    | { status: "actor_not_authorized" | "not_found" | "self_update" | "last_active_admin" };

export async function updateUserRoleGuarded(
    actorUserId: string,
    userId: string,
    role: UserRole,
): Promise<GuardedUserUpdateResult> {
    const database = ensureDatabaseReady();

    return database.transaction(
        (tx) => {
            const actor = tx.select().from(users).where(eq(users.id, actorUserId)).get();

            if (!actor || actor.role !== "admin" || actor.isDisabled) {
                return { status: "actor_not_authorized" } as const;
            }

            const target = tx.select().from(users).where(eq(users.id, userId)).get();

            if (!target) {
                return { status: "not_found" } as const;
            }

            if (target.id === actorUserId) {
                return { status: "self_update" } as const;
            }

            if (target.role === role) {
                return { status: "unchanged", user: target } as const;
            }

            if (target.role === "admin" && role !== "admin" && !target.isDisabled) {
                const activeAdminCount =
                    tx
                        .select({ count: count() })
                        .from(users)
                        .where(and(eq(users.role, "admin"), eq(users.isDisabled, false)))
                        .get()?.count ?? 0;

                if (activeAdminCount <= 1) {
                    return { status: "last_active_admin" } as const;
                }
            }

            tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId)).run();

            const updated = tx.select().from(users).where(eq(users.id, userId)).get()!;

            return { status: "updated", user: updated, previousUser: target } as const;
        },
        { behavior: "immediate" },
    );
}

export async function updateUserDisabledStateGuarded(
    actorUserId: string,
    userId: string,
    isDisabled: boolean,
): Promise<GuardedUserUpdateResult> {
    const database = ensureDatabaseReady();

    return database.transaction(
        (tx) => {
            const actor = tx.select().from(users).where(eq(users.id, actorUserId)).get();

            if (!actor || actor.role !== "admin" || actor.isDisabled) {
                return { status: "actor_not_authorized" } as const;
            }

            const target = tx.select().from(users).where(eq(users.id, userId)).get();

            if (!target) {
                return { status: "not_found" } as const;
            }

            if (target.id === actorUserId) {
                return { status: "self_update" } as const;
            }

            if (target.isDisabled === isDisabled) {
                return { status: "unchanged", user: target } as const;
            }

            if (isDisabled && target.role === "admin" && !target.isDisabled) {
                const activeAdminCount =
                    tx
                        .select({ count: count() })
                        .from(users)
                        .where(and(eq(users.role, "admin"), eq(users.isDisabled, false)))
                        .get()?.count ?? 0;

                if (activeAdminCount <= 1) {
                    return { status: "last_active_admin" } as const;
                }
            }

            tx.update(users)
                .set({
                    isDisabled,
                    ...(isDisabled ? { authGeneration: sql`${users.authGeneration} + 1` } : {}),
                    updatedAt: new Date(),
                })
                .where(eq(users.id, userId))
                .run();

            if (isDisabled) {
                // Revocation belongs in the same transaction as disablement. Otherwise a
                // later re-enable could make a still-unexpired JWT valid again.
                tx.delete(authSessions).where(eq(authSessions.userId, userId)).run();
            }

            const updated = tx.select().from(users).where(eq(users.id, userId)).get()!;

            return { status: "updated", user: updated, previousUser: target } as const;
        },
        { behavior: "immediate" },
    );
}

type CreateAuditEventInput = {
    actorUserId?: string | null;
    eventType: string;
    subjectType: string;
    subjectId?: string | null;
    payloadJson?: string | null;
    payload?: unknown;
};

export async function createAuditEvent(input: CreateAuditEventInput) {
    const database = ensureDatabaseReady();

    // Prefer the structured `payload` field (gets scrubbed automatically). Fall back to
    // the legacy `payloadJson` string for callers that haven't migrated yet — but still
    // run it through the scrubber by parsing then re-serializing.
    let scrubbedPayloadJson: string | null = null;

    if (input.payload !== undefined) {
        scrubbedPayloadJson = buildAuditPayload(input.payload);
    } else if (input.payloadJson) {
        try {
            scrubbedPayloadJson = buildAuditPayload(JSON.parse(input.payloadJson));
        } catch {
            // Non-JSON legacy payload — keep as-is rather than dropping audit data.
            scrubbedPayloadJson = input.payloadJson;
        }
    }

    database
        .insert(auditEvents)
        .values({
            id: randomUUID(),
            actorUserId: input.actorUserId ?? null,
            eventType: input.eventType,
            subjectType: input.subjectType,
            subjectId: input.subjectId ?? null,
            payloadJson: scrubbedPayloadJson,
        })
        .run();
}
