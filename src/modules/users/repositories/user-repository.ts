import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, users, type UserRole } from "@/lib/database/schema";

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

export async function findUserByEmail(email: string) {
  const database = ensureDatabaseReady();

  return (
    database.select().from(users).where(eq(users.email, normalizeEmail(email))).get() ?? null
  );
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

type CreateAuditEventInput = {
  actorUserId?: string | null;
  eventType: string;
  subjectType: string;
  subjectId?: string | null;
  payloadJson?: string | null;
};

export async function createAuditEvent(input: CreateAuditEventInput) {
  const database = ensureDatabaseReady();

  database
    .insert(auditEvents)
    .values({
      id: randomUUID(),
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      payloadJson: input.payloadJson ?? null,
    })
    .run();
}
