import { randomUUID } from "node:crypto";

import { and, count, desc, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, users, type UserRole } from "@/lib/database/schema";
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
    database.select().from(users).where(eq(users.email, normalizeEmail(email))).get() ?? null
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
    })
    .run();

  return database.select().from(users).where(eq(users.id, id)).get() ?? null;
}

export async function updateUserPassword(userId: string, passwordHash: string) {
  const database = ensureDatabaseReady();
  const now = new Date();

  database
    .update(users)
    .set({
      passwordHash,
      passwordChangedAt: now,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    })
    .where(eq(users.id, userId))
    .run();

  return findUserById(userId);
}

export async function recordFailedLogin(userId: string, lockoutThreshold: number, lockoutDurationMs: number) {
  const database = ensureDatabaseReady();
  const now = new Date();

  return database.transaction((tx) => {
    const user = tx.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return null;

    const nextAttempts = (user.failedLoginAttempts ?? 0) + 1;
    const shouldLock = nextAttempts >= lockoutThreshold;

    tx.update(users)
      .set({
        failedLoginAttempts: nextAttempts,
        lockedUntil: shouldLock ? new Date(now.getTime() + lockoutDurationMs) : user.lockedUntil,
        updatedAt: now,
      })
      .where(eq(users.id, userId))
      .run();

    return { attempts: nextAttempts, locked: shouldLock };
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

export async function updateUserRole(userId: string, role: UserRole) {
  const database = ensureDatabaseReady();

  database
    .update(users)
    .set({
      role,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .run();

  return findUserById(userId);
}

export async function updateUserDisabledState(userId: string, isDisabled: boolean) {
  const database = ensureDatabaseReady();

  database
    .update(users)
    .set({
      isDisabled,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .run();

  return findUserById(userId);
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
