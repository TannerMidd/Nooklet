import path from "node:path";

import { describe, expect, it } from "vitest";

import { type ActiveMediaLibraryPathRecord } from "@/modules/media-library/repositories/media-library-repository";

import { normalizeLibraryFiles } from "./normalization";
import { type FetchedLibrarySources } from "./source-fetch";

function source(mediaType: "movie" | "tv", rootPath: string): ActiveMediaLibraryPathRecord {
  return {
    library: {
      id: `${mediaType}-library`,
      userId: "user1",
      mediaType,
      name: mediaType === "tv" ? "TV Shows" : "Movies",
      isDefault: true,
      createdAt: new Date("2026-05-06T12:00:00Z"),
      updatedAt: new Date("2026-05-06T12:00:00Z"),
    },
    path: {
      id: `${mediaType}-path`,
      libraryId: `${mediaType}-library`,
      userId: "user1",
      path: rootPath,
      label: mediaType === "tv" ? "TV" : "Movies",
      status: "active",
      freeSpaceBytes: null,
      totalSpaceBytes: null,
      lastScannedAt: null,
      createdAt: new Date("2026-05-06T12:00:00Z"),
      updatedAt: new Date("2026-05-06T12:00:00Z"),
    },
  };
}

function fetched(sourceRecord: ActiveMediaLibraryPathRecord, relativePath: string): FetchedLibrarySources {
  return {
    sources: [sourceRecord],
    failedPaths: [],
    files: [{
      source: sourceRecord,
      filePath: path.join(sourceRecord.path.path, ...relativePath.split("/")),
      relativePath,
      sizeBytes: 42,
      modifiedAt: new Date("2026-05-06T13:00:00Z"),
    }],
  };
}

describe("normalizeLibraryFiles", () => {
  it("groups TV episodes by show folder and extracts season and episode numbers", () => {
    const tvSource = source("tv", path.join("E:\\", "Plex Media", "TV Shows"));
    const result = normalizeLibraryFiles(fetched(
      tvSource,
      "George Lopez/Season 03/George.Lopez.S03E11.1080p.WEB.h264-SKYFiRE.mkv",
    ));

    expect(result.files[0]).toEqual(expect.objectContaining({
      title: "George Lopez",
      sortTitle: "george lopez",
      normalizedKey: "george lopez::unknown",
      fileKind: "episode",
      seasonNumber: 3,
      episodeNumber: 11,
      qualityLabel: "1080P",
    }));
  });

  it("uses the first folder as the TV show when no season folder exists", () => {
    const tvSource = source("tv", path.join("E:\\", "Plex Media", "TV Shows"));
    const result = normalizeLibraryFiles(fetched(
      tvSource,
      "Severance/Severance.S01E02.2160p.WEB-DL.mkv",
    ));

    expect(result.files[0]).toEqual(expect.objectContaining({
      title: "Severance",
      normalizedKey: "severance::unknown",
      seasonNumber: 1,
      episodeNumber: 2,
      qualityLabel: "2160P",
    }));
  });

  it("keeps movie files as movie titles without TV episode metadata", () => {
    const movieSource = source("movie", path.join("F:\\", "Movies"));
    const result = normalizeLibraryFiles(fetched(
      movieSource,
      "Arrival (2016)/Arrival.2016.1080p.BluRay.mkv",
    ));

    expect(result.files[0]).toEqual(expect.objectContaining({
      title: "Arrival",
      normalizedKey: "arrival::2016",
      fileKind: "movie",
      seasonNumber: null,
      episodeNumber: null,
      qualityLabel: "1080P",
    }));
  });
});