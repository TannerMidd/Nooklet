import { eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { mediaTitleExternalIds } from "@/lib/database/schema";
import {
  findMediaTitleByIdForUser,
  setMediaTitleExternalIds,
} from "@/modules/media-library/repositories/media-library-repository";
import { lookupTmdbTitleDetails } from "@/modules/service-connections/public";
import { getVerifiedTmdbConnection } from "@/modules/service-connections/queries/get-verified-tmdb-connection";

export type AutoLinkMediaTitleTmdbResult =
  | { status: "already-linked"; tmdbId: number }
  | { status: "linked"; tmdbId: number }
  | { status: "skipped"; reason: "title-not-found" | "no-tmdb-connection" | "no-match" };

function readExistingTmdbId(titleId: string): number | null {
  const database = ensureDatabaseReady();
  const row = database
    .select()
    .from(mediaTitleExternalIds)
    .where(eq(mediaTitleExternalIds.titleId, titleId))
    .all()
    .find((entry) => entry.source === "tmdb");

  if (!row) {
    return null;
  }

  const parsed = Number.parseInt(row.value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function autoLinkMediaTitleTmdb(
  userId: string,
  titleId: string,
): Promise<AutoLinkMediaTitleTmdbResult> {
  const existingTmdbId = readExistingTmdbId(titleId);

  if (existingTmdbId !== null) {
    return { status: "already-linked", tmdbId: existingTmdbId };
  }

  const title = await findMediaTitleByIdForUser(userId, titleId);

  if (!title) {
    return { status: "skipped", reason: "title-not-found" };
  }

  const tmdbConnection = await getVerifiedTmdbConnection(userId);

  if (!tmdbConnection) {
    return { status: "skipped", reason: "no-tmdb-connection" };
  }

  const lookup = await lookupTmdbTitleDetails({
    ...tmdbConnection,
    mediaType: title.mediaType,
    title: title.title,
    year: title.year,
  });

  if (!lookup.ok || !lookup.details.tmdbId) {
    return { status: "skipped", reason: "no-match" };
  }

  await setMediaTitleExternalIds(title.id, [
    { source: "tmdb", value: String(lookup.details.tmdbId) },
  ]);

  return { status: "linked", tmdbId: lookup.details.tmdbId };
}
