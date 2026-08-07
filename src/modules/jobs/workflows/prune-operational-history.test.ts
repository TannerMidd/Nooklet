import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, authSessions, users } from "@/lib/database/schema";

import { pruneOperationalHistory } from "./prune-operational-history";

describe("pruneOperationalHistory", () => {
  it("removes expired operational audit rows and keeps recent rows", async () => {
    const database = ensureDatabaseReady();
    const userId = randomUUID();
    const oldId = randomUUID();
    const recentId = randomUUID();
    const expiredSessionId = randomUUID();
    database.insert(users).values({
      id: userId,
      email: `${userId}@retention.test`,
      displayName: "Retention",
      passwordHash: "x",
      role: "admin",
    }).run();
    database.insert(authSessions).values({
      id: expiredSessionId,
      userId,
      authGeneration: 0,
      expiresAt: new Date("2026-08-05T23:59:59.999Z"),
    }).run();
    database.insert(auditEvents).values([
      {
        id: oldId,
        actorUserId: userId,
        eventType: "test.old",
        subjectType: "test",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
      {
        id: recentId,
        actorUserId: userId,
        eventType: "test.recent",
        subjectType: "test",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]).run();

    const result = await pruneOperationalHistory({
      now: new Date("2026-08-06T00:00:00.000Z"),
      retentionDays: 365,
    });

    expect(result.expiredAuthSessions).toBeGreaterThanOrEqual(1);
    expect(database.select().from(authSessions)
      .where(eq(authSessions.id, expiredSessionId)).get()).toBeUndefined();
    expect(result.auditEvents).toBeGreaterThanOrEqual(1);
    expect(database.select().from(auditEvents).where(eq(auditEvents.id, oldId)).get()).toBeUndefined();
    expect(database.select().from(auditEvents).where(eq(auditEvents.id, recentId)).get()?.id).toBe(recentId);
  });
});
