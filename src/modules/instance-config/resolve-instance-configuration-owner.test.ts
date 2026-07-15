import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";

import { resolveInstanceConfigurationOwnerId } from "./resolve-instance-configuration-owner";

function seedUser(role: "admin" | "user", isDisabled = false) {
  const id = randomUUID();
  ensureDatabaseReady().insert(users).values({
    id,
    email: `${id}@readiness.test`,
    displayName: role,
    passwordHash: "x",
    role,
    isDisabled,
  }).run();
  return id;
}

describe("resolveInstanceConfigurationOwnerId", () => {
  it("keeps administrators on their own configuration", async () => {
    const adminId = seedUser("admin");
    expect(await resolveInstanceConfigurationOwnerId(adminId)).toBe(adminId);
  });

  it("lets regular users consume the active administrator configuration", async () => {
    seedUser("admin");
    const userId = seedUser("user");
    const resolvedId = await resolveInstanceConfigurationOwnerId(userId);
    const resolved = ensureDatabaseReady().select().from(users).all().find((user) => user.id === resolvedId);
    expect(resolved).toMatchObject({ role: "admin", isDisabled: false });
  });
});
