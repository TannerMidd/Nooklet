import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, users } from "@/lib/database/schema";
import { type BootstrapInput } from "@/modules/identity-access/schemas/bootstrap";
import { hashPassword } from "@/modules/users/password-hasher";

export type CreateFirstAdminResult =
  | { ok: true }
  | { ok: false; message: string; field?: "email" };

export async function createFirstAdmin(
  input: BootstrapInput,
): Promise<CreateFirstAdminResult> {
  const database = ensureDatabaseReady();

  const result = database.transaction((tx) => {
    const adminCount = tx
      .select({ count: count() })
      .from(users)
      .where(eq(users.role, "admin"))
      .get()?.count;

    if ((adminCount ?? 0) > 0) {
      return {
        ok: false as const,
        message: "Bootstrap is already complete.",
      };
    }

    const existingUser = tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .get();

    if (existingUser) {
      return {
        ok: false as const,
        message: "An account with that email already exists.",
        field: "email" as const,
      };
    }

    const userId = randomUUID();

    tx
      .insert(users)
      .values({
        id: userId,
        email: input.email,
        displayName: input.displayName,
        passwordHash: hashPassword(input.password),
        role: "admin",
      })
      .run();

    tx
      .insert(auditEvents)
      .values({
        id: randomUUID(),
        actorUserId: userId,
        eventType: "identity.bootstrap.completed",
        subjectType: "user",
        subjectId: userId,
        payloadJson: JSON.stringify({
          email: input.email,
          role: "admin",
        }),
      })
      .run();

    return { ok: true as const };
  });

  return result;
}
