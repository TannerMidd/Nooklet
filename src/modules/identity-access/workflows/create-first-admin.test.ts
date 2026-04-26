import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, users } from "@/lib/database/schema";
import { verifyPassword } from "@/modules/users/password-hasher";

import { createFirstAdmin } from "./create-first-admin";

const TEST_EMAIL_DOMAIN = "create-first-admin.test";

function bootstrapInput(overrides: Partial<Parameters<typeof createFirstAdmin>[0]> = {}) {
  return {
    displayName: "Test Admin",
    email: `admin@${TEST_EMAIL_DOMAIN}`,
    password: "Sup3rSecret!Pass",
    confirmPassword: "Sup3rSecret!Pass",
    ...overrides,
  };
}

function clearTestUsers() {
  const database = ensureDatabaseReady();
  const matching = database
    .select({ id: users.id })
    .from(users)
    .all()
    .filter((row) =>
      database
        .select()
        .from(users)
        .where(eq(users.id, row.id))
        .get()
        ?.email.endsWith(`@${TEST_EMAIL_DOMAIN}`),
    );

  if (matching.length === 0) return;

  const ids = matching.map((row) => row.id);
  database.delete(auditEvents).where(inArray(auditEvents.actorUserId, ids)).run();
  database.delete(users).where(inArray(users.id, ids)).run();
}

describe("createFirstAdmin", () => {
  beforeEach(clearTestUsers);
  afterEach(clearTestUsers);

  it("creates an admin user, hashes the password, and writes a bootstrap audit event", async () => {
    const database = ensureDatabaseReady();

    const result = await createFirstAdmin(bootstrapInput());

    expect(result).toEqual({ ok: true });

    const created = database
      .select()
      .from(users)
      .where(eq(users.email, `admin@${TEST_EMAIL_DOMAIN}`))
      .get();

    expect(created).toBeTruthy();
    expect(created?.role).toBe("admin");
    expect(created?.displayName).toBe("Test Admin");
    // Password must never be stored in plaintext.
    expect(created?.passwordHash).not.toBe("Sup3rSecret!Pass");
    expect(created?.passwordHash).toMatch(/^scrypt\$/);
    expect(verifyPassword("Sup3rSecret!Pass", created!.passwordHash)).toBe(true);

    const audit = database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorUserId, created!.id))
      .all();

    expect(audit).toHaveLength(1);
    expect(audit[0].eventType).toBe("identity.bootstrap.completed");
    expect(audit[0].subjectType).toBe("user");
    expect(audit[0].subjectId).toBe(created!.id);
    const payload = JSON.parse(audit[0].payloadJson ?? "null");
    // Audit payload must capture the role transition but never the password.
    expect(payload).toEqual({
      email: `admin@${TEST_EMAIL_DOMAIN}`,
      role: "admin",
    });
    expect(audit[0].payloadJson).not.toContain("Sup3rSecret!Pass");
  });

  it("refuses to create a second admin once bootstrap is complete", async () => {
    const first = await createFirstAdmin(bootstrapInput());
    expect(first).toEqual({ ok: true });

    const second = await createFirstAdmin(
      bootstrapInput({
        email: `second@${TEST_EMAIL_DOMAIN}`,
        displayName: "Second",
      }),
    );

    expect(second).toEqual({
      ok: false,
      message: "Bootstrap is already complete.",
    });

    const database = ensureDatabaseReady();
    const adminCount = database
      .select()
      .from(users)
      .where(eq(users.email, `second@${TEST_EMAIL_DOMAIN}`))
      .all();

    // The would-be second admin row must not be persisted.
    expect(adminCount).toHaveLength(0);
  });

  it("rejects when the email already belongs to a non-admin user and reports the field", async () => {
    const database = ensureDatabaseReady();

    // Seed a non-admin row with the same email so the admin precheck passes
    // but the email-uniqueness check still rejects.
    database
      .insert(users)
      .values({
        id: "preexisting-user-id",
        email: `taken@${TEST_EMAIL_DOMAIN}`,
        displayName: "Existing",
        passwordHash: "scrypt$irrelevant$irrelevant",
        role: "user",
      })
      .run();

    const result = await createFirstAdmin(
      bootstrapInput({ email: `taken@${TEST_EMAIL_DOMAIN}` }),
    );

    expect(result).toEqual({
      ok: false,
      message: "An account with that email already exists.",
      field: "email",
    });

    const adminRows = database
      .select()
      .from(users)
      .where(eq(users.role, "admin"))
      .all()
      .filter((row) => row.email.endsWith(`@${TEST_EMAIL_DOMAIN}`));

    expect(adminRows).toHaveLength(0);
  });

  it("rolls back the audit event when admin creation fails downstream", async () => {
    const database = ensureDatabaseReady();

    // Pre-create an admin so the inner check fails AFTER the function opens
    // its transaction. This proves the failure path emits no audit row.
    database
      .insert(users)
      .values({
        id: "preexisting-admin-id",
        email: `early-admin@${TEST_EMAIL_DOMAIN}`,
        displayName: "Early Admin",
        passwordHash: "scrypt$irrelevant$irrelevant",
        role: "admin",
      })
      .run();

    const result = await createFirstAdmin(bootstrapInput());

    expect(result).toEqual({
      ok: false,
      message: "Bootstrap is already complete.",
    });

    const audits = database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "identity.bootstrap.completed"))
      .all()
      .filter((row) => row.actorUserId === "preexisting-admin-id");

    expect(audits).toHaveLength(0);
  });
});
