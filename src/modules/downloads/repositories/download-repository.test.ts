import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { downloadQueueItems, serviceConnections, users } from "@/lib/database/schema";

import {
  createDownloadClient,
  createDownloadRequest,
  findDownloadClientById,
  listDownloadRequestsByStatus,
  recordDownloadQueueItem,
  updateDownloadRequestStatus,
} from "./download-repository";

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

function seedSabnzbdConnection(userId: string) {
  const database = ensureDatabaseReady();
  const connectionId = randomUUID();

  database
    .insert(serviceConnections)
    .values({
      id: connectionId,
      serviceType: "sabnzbd",
      ownerUserId: userId,
      displayName: "SABnzbd",
      baseUrl: "http://localhost:8080",
      status: "verified",
    })
    .run();

  return connectionId;
}

beforeEach(() => {
  ensureDatabaseReady();
});

describe("download-repository", () => {
  it("persists a download client, request, and queue item", async () => {
    const userId = await seedUser();
    const serviceConnectionId = seedSabnzbdConnection(userId);
    const client = await createDownloadClient({
      userId,
      serviceConnectionId,
      clientType: "sabnzbd",
      displayName: "SABnzbd",
      status: "verified",
      isDefault: true,
    });

    expect(client).not.toBeNull();
    if (!client) throw new Error("download client missing");

    const request = await createDownloadRequest({
      userId,
      mediaType: "movie",
      requestedTitle: "Arrival",
      releaseTitle: "Arrival 2016 2160p WEB-DL",
      clientId: client.id,
      status: "pending",
    });
    const queuedRequest = await updateDownloadRequestStatus({
      userId,
      requestId: request.id,
      status: "queued",
      externalJobId: "sab-job-1",
      statusMessage: "Queued in SABnzbd",
    });
    if (!queuedRequest) throw new Error("queued request missing");

    const queueItem = await recordDownloadQueueItem({
      requestId: request.id,
      userId,
      clientId: client.id,
      externalQueueId: "sab-queue-1",
      status: "downloading",
      progressPercent: 42.5,
      sizeBytes: 20_000_000_000,
      remainingBytes: 11_500_000_000,
      etaSeconds: 600,
      category: "nooklet-movies",
    });

    const reloadedClient = await findDownloadClientById(userId, client.id);
    const queuedRequests = await listDownloadRequestsByStatus(userId, "queued");
    const storedQueueItem = ensureDatabaseReady()
      .select()
      .from(downloadQueueItems)
      .where(eq(downloadQueueItems.id, queueItem.id))
      .get();

    expect(reloadedClient?.serviceConnectionId).toBe(serviceConnectionId);
    expect(reloadedClient?.isDefault).toBe(true);
    expect(queuedRequest.externalJobId).toBe("sab-job-1");
    expect(queuedRequests.map((entry) => entry.id)).toEqual([request.id]);
    expect(storedQueueItem?.progressPercent).toBe(42.5);
    expect(storedQueueItem?.category).toBe("nooklet-movies");
  });
});
