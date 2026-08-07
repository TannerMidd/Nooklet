import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import { addIndexerCommand } from "@/modules/indexers/commands/add-indexer";

import { listIndexerSettings } from "./list-indexer-settings";

async function seedUser() {
  const database = ensureDatabaseReady();
  const userId = randomUUID();

  database
    .insert(users)
    .values({
      id: userId,
      email: `${userId}@test.local`,
      displayName: "test",
      passwordHash: "x",
      role: "user",
    })
    .run();

  return userId;
}

beforeEach(() => {
  ensureDatabaseReady();
});

describe("listIndexerSettings", () => {
  it("returns instance-scoped indexer settings without encrypted secrets", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();

    await addIndexerCommand(userId, {
      name: "Main indexer",
      protocol: "newznab",
      baseUrl: "https://api.example.test",
      apiPath: "/api",
      apiKey: "main-secret",
      isEnabled: true,
      priority: 1,
      categories: [
        { mediaType: "movie", categoryId: "2000", label: "Movies" },
        { mediaType: "tv", categoryId: "5000", label: "TV" },
      ],
    });
    await addIndexerCommand(otherUserId, {
      name: "Other user indexer",
      protocol: "newznab",
      baseUrl: "https://other.example.test",
      apiPath: "/api",
      apiKey: "other-secret",
      isEnabled: true,
      priority: 0,
      categories: [{ mediaType: "movie", categoryId: "2000", label: "Movies" }],
    });

    const settings = await listIndexerSettings(userId);

    expect(settings).toHaveLength(2);
    expect(settings.find((setting) => setting.name === "Main indexer")).toMatchObject({
      name: "Main indexer",
      maskedApiKey: "ma*******et",
      categories: [
        { mediaType: "movie", categoryId: "2000", label: "Movies" },
        { mediaType: "tv", categoryId: "5000", label: "TV" },
      ],
    });
    expect(JSON.stringify(settings)).not.toContain("main-secret");
    expect(JSON.stringify(settings)).not.toContain("other-secret");
  });
});
