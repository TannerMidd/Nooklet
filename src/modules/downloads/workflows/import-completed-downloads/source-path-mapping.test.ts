import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  mapCompletedDownloadSourcePath,
  parseCompletedDownloadPathMappings,
} from "./source-path-mapping";

describe("completed download source path mapping", () => {
  it("parses semicolon and newline separated path mappings", () => {
    const mappings = parseCompletedDownloadPathMappings([
      "/downloads=F:\\Usenet\\Downloads",
      "/downloads/complete=E:\\Completed Downloads",
      "invalid",
    ].join("\n"));

    expect(mappings).toEqual([
      { sourcePrefix: "/downloads/complete", targetPrefix: "E:\\Completed Downloads" },
      { sourcePrefix: "/downloads", targetPrefix: "F:\\Usenet\\Downloads" },
    ]);
  });

  it("maps SABnzbd container paths to the configured host path", () => {
    const mapped = mapCompletedDownloadSourcePath(
      "/downloads/complete/Star.Trek.2009/Movie.mkv",
      [{ sourcePrefix: "/downloads", targetPrefix: "F:\\Usenet\\Downloads" }],
    );

    expect(mapped).toBe(path.join("F:\\Usenet\\Downloads", "complete", "Star.Trek.2009", "Movie.mkv"));
  });

  it("uses the most specific matching prefix", () => {
    const mapped = mapCompletedDownloadSourcePath(
      "/downloads/complete/Arrival/Movie.mkv",
      parseCompletedDownloadPathMappings(
        "/downloads=F:\\Usenet\\Downloads;/downloads/complete=E:\\Completed",
      ),
    );

    expect(mapped).toBe(path.join("E:\\Completed", "Arrival", "Movie.mkv"));
  });

  it("leaves unmapped paths unchanged", () => {
    expect(mapCompletedDownloadSourcePath("C:\\Downloads\\Movie.mkv", [])).toBe(
      "C:\\Downloads\\Movie.mkv",
    );
  });
});