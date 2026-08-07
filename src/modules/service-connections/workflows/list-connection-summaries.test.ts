import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/secret-box")>();

  return {
    ...actual,
    decryptSecretWithMetadata: vi.fn(actual.decryptSecretWithMetadata),
  };
});

import { ensureDatabaseReady } from "@/lib/database/client";
import { serviceConnections, serviceSecrets, users } from "@/lib/database/schema";
import { decryptSecretWithMetadata } from "@/lib/security/secret-box";

import { listConnectionSummaries } from "./list-connection-summaries";

const decryptMock = vi.mocked(decryptSecretWithMetadata);

function seedUserWithConnection(serviceType: "trakt", maskedValue: string) {
  const database = ensureDatabaseReady();
  const userId = randomUUID();
  const connectionId = randomUUID();

  database.insert(users).values({
    id: userId,
    email: `${userId}@summary.test`,
    displayName: "Summary user",
    passwordHash: "x",
    role: "user",
  }).run();
  database.insert(serviceConnections).values({
    id: connectionId,
    serviceType,
    ownershipScope: "shared",
    ownerUserId: userId,
    displayName: serviceType.toUpperCase(),
    baseUrl: `https://${serviceType}.example.com`,
    status: "verified",
    statusMessage: "Connected",
  }).run();
  database.insert(serviceSecrets).values({
    connectionId,
    // Deliberately invalid ciphertext: a summary must never read or rotate it.
    encryptedValue: `invalid-ciphertext-${connectionId}`,
    maskedValue,
  }).run();

  return userId;
}

describe("listConnectionSummaries", () => {
  beforeEach(() => {
    ensureDatabaseReady();
    decryptMock.mockClear();
  });

  it("loads only the requested user's masked projection without decrypting any secret", async () => {
    const userId = seedUserWithConnection("trakt", "trakt-requester-••••");
    seedUserWithConnection("trakt", "trakt-other-user-••••");

    const summaries = await listConnectionSummaries(userId);

    expect(summaries.find((summary) => summary.serviceType === "trakt"))
      .toMatchObject({ status: "verified", maskedSecret: "trakt-requester-••••" });
    expect(decryptMock).not.toHaveBeenCalled();
  });
});
