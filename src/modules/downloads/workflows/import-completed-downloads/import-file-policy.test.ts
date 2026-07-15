import { describe, expect, it } from "vitest";

import {
  classifyVideoImportRole,
  importFileKind,
  isGenericTitleSidecar,
  matchedCompanionSuffix,
  moviePartNumber,
  primaryVideoFiles,
} from "./import-file-policy";

describe("completed-download import file policy", () => {
  it("treats explicit Sample and Extras directories as non-primary", () => {
    const files = [
      { relativePath: "Movie.2026.mkv", sizeBytes: 1_000 },
      { relativePath: "Samples/Movie.Sample.mkv", sizeBytes: 100 },
      { relativePath: "Extras/Movie.S01E99.mkv", sizeBytes: 200 },
    ];

    expect(files.map((file) => classifyVideoImportRole(file, files)))
      .toEqual(["primary", "sample", "extra"]);
    expect(primaryVideoFiles(files)).toEqual([files[0]]);
  });

  it("uses a filename sample marker only when a larger sibling makes it unambiguous", () => {
    const release = [
      { relativePath: "Movie.2026.mkv", sizeBytes: 1_000 },
      { relativePath: "Movie.2026.Sample.mkv", sizeBytes: 100 },
    ];
    const filmNamedSample = [{ relativePath: "Sample.2015.mkv", sizeBytes: 1_000 }];

    expect(classifyVideoImportRole(release[1]!, release)).toBe("sample");
    expect(classifyVideoImportRole(filmNamedSample[0]!, filmNamedSample)).toBe("primary");
  });

  it("recognizes common multi-part movie labels", () => {
    expect(moviePartNumber("Movie.CD1.1080p.mkv")).toBe(1);
    expect(moviePartNumber("Movie - Disc 02.mp4")).toBe(2);
    expect(moviePartNumber("Movie.part3.mkv")).toBe(3);
    expect(moviePartNumber("Movie.1080p.mkv")).toBeNull();
  });

  it("matches only reliable subtitle and sidecar companions", () => {
    expect(matchedCompanionSuffix("Movie.en.forced.srt", "Movie.mkv")).toBe(".en.forced");
    expect(matchedCompanionSuffix("Subs/Movie.sdh.ass", "Movie.mkv")).toBe(".sdh");
    expect(matchedCompanionSuffix("Movie.nfo", "Movie.mkv")).toBe("");
    expect(matchedCompanionSuffix("English.srt", "Movie.mkv")).toBeNull();
    expect(matchedCompanionSuffix("Other.nfo", "Movie.mkv")).toBeNull();
  });

  it("keeps a narrow, documented set of generic title sidecars", () => {
    expect(importFileKind("Movie.srt")).toBe("subtitle");
    expect(importFileKind("poster.jpg")).toBe("sidecar");
    expect(importFileKind("readme.txt")).toBeNull();
    expect(isGenericTitleSidecar("movie.nfo")).toBe(true);
    expect(isGenericTitleSidecar("poster.jpg")).toBe(true);
    expect(isGenericTitleSidecar("Artwork/poster.jpg")).toBe(false);
  });
});
