import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import {
  findDownloadFulfillmentById,
  createOrGetOpenSeasonFulfillment,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import {
  reconcileSeasonFulfillmentCancellation,
} from "@/modules/downloads/workflows/reconcile-season-fulfillment-cancellations";
import {
  createMediaLibrary,
  createTvSeason,
  findMediaTitleByIdForUser,
  upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";

import { retireMediaTitlePreservingFilesWorkflow } from "./retire-media-title-preserving-files";

describe("safe duplicate-title retirement", () => {
  it("cancels an active zero-file season plan before removing its duplicate title", async () => {
    const userId = randomUUID();
    ensureDatabaseReady().insert(users).values({
      id: userId,
      email: `${userId}@test.local`,
      displayName: "test",
      passwordHash: "x",
      role: "user",
    }).run();
    const library = await createMediaLibrary({
      userId,
      mediaType: "tv",
      name: `TV ${userId}`,
      isDefault: true,
    });
    const title = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "tv",
      title: "Ed, Edd n Eddy (1999)",
      sortTitle: "ed edd n eddy 1999",
      normalizedKey: `ed-edd-n-eddy-requested::${userId}`,
      year: 1999,
      status: "requested",
    });
    if (!title) throw new Error("title missing");
    const season = await createTvSeason({ titleId: title.id, seasonNumber: 2 });
    const fulfillment = await createOrGetOpenSeasonFulfillment({
      userId,
      mediaTitleId: title.id,
      seasonId: season.id,
      requestedTitle: "Ed, Edd n Eddy S02",
      status: "partial",
      nextAttemptAt: new Date(),
    });

    const firstPass = await retireMediaTitlePreservingFilesWorkflow(userId, title.id);

    expect(firstPass).toMatchObject({
      status: "pending",
      removedTitle: null,
      cancellationCheckpointCount: 1,
    });
    expect(await findMediaTitleByIdForUser(userId, title.id)).not.toBeNull();
    expect(await findDownloadFulfillmentById(userId, fulfillment.id)).toMatchObject({
      status: "retry_wait",
      cancellationRequestedAt: expect.any(Date),
    });

    await expect(reconcileSeasonFulfillmentCancellation(userId, fulfillment.id))
      .resolves.toBe("cancelled");

    const secondPass = await retireMediaTitlePreservingFilesWorkflow(userId, title.id);

    expect(secondPass).toMatchObject({
      status: "removed",
      removedTitle: expect.objectContaining({ id: title.id }),
    });
    expect(await findMediaTitleByIdForUser(userId, title.id)).toBeNull();
    expect(await findDownloadFulfillmentById(userId, fulfillment.id)).toBeNull();
  });
});
