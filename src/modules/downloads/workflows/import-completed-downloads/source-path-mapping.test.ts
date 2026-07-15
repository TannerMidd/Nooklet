import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { env } from "@/lib/env";

import {
  mapCompletedDownloadSourcePath,
  parseApprovedDownloadRoots,
  parseCompletedDownloadPathMappings,
  resolveCompletedDownloadSourcePath,
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

  it("maps SABnzbd container paths to the configured local path", () => {
    const targetRoot = path.join(os.tmpdir(), "Nooklet Downloads");
    const mapped = mapCompletedDownloadSourcePath(
      "/downloads/complete/Star.Trek.2009/Movie.mkv",
      [{ sourcePrefix: "/downloads", targetPrefix: targetRoot }],
    );

    expect(mapped).toBe(path.join(targetRoot, "complete", "Star.Trek.2009", "Movie.mkv"));
  });

  it("uses the most specific matching prefix", () => {
    const broadTarget = path.join(os.tmpdir(), "Nooklet Downloads");
    const specificTarget = path.join(os.tmpdir(), "Nooklet Completed");
    const mapped = mapCompletedDownloadSourcePath(
      "/downloads/complete/Arrival/Movie.mkv",
      parseCompletedDownloadPathMappings(
        `/downloads=${broadTarget};/downloads/complete=${specificTarget}`,
      ),
    );

    expect(mapped).toBe(path.join(specificTarget, "Arrival", "Movie.mkv"));
  });

  it("leaves unmapped paths unchanged", () => {
    expect(mapCompletedDownloadSourcePath("C:\\Downloads\\Movie.mkv", [])).toBe(
      "C:\\Downloads\\Movie.mkv",
    );
  });

  it("parses approved completed-download roots", () => {
    expect(parseApprovedDownloadRoots("/downloads;/mnt/complete\r\n/archive")).toEqual([
      "/downloads",
      "/mnt/complete",
      "/archive",
    ]);
  });

  it("rejects mapped paths that traverse outside the configured target", () => {
    expect(() => mapCompletedDownloadSourcePath(
      "/downloads/../../Windows/System32",
      [{ sourcePrefix: "/downloads", targetPrefix: "F:\\Usenet\\Downloads" }],
    )).toThrow(/outside the configured mapping/);
  });

  it("fails closed for unmapped SAB paths outside configured download roots", async () => {
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "nooklet-download-root-"));
    const approvedRoot = path.join(sandbox, "downloads");
    const inside = path.join(approvedRoot, "complete", "Movie.mkv");
    const outside = path.join(sandbox, "outside", "Secret.mkv");

    try {
      await mkdir(path.dirname(inside), { recursive: true });
      await mkdir(path.dirname(outside), { recursive: true });
      await writeFile(inside, "media");
      await writeFile(outside, "outside");

      await expect(resolveCompletedDownloadSourcePath(inside, {
        mappings: [],
        approvedRoots: [approvedRoot],
      })).resolves.toBe(await realpath(inside));

      await expect(resolveCompletedDownloadSourcePath(outside, {
        mappings: [],
        approvedRoots: [approvedRoot],
      })).rejects.toThrow(/outside the approved roots/i);

      await expect(resolveCompletedDownloadSourcePath(inside, {
        mappings: [],
        approvedRoots: [],
      })).rejects.toThrow(/No approved completed-download roots/i);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it("allows the built-in engine to opt into its separately controlled local source", async () => {
    const downloadFolder = path.resolve(
      env.DOWNLOAD_ENGINE_DIR,
      "complete",
      `policy-test-${randomUUID()}`,
    );
    const source = path.join(downloadFolder, "Movie.mkv");

    try {
      await mkdir(downloadFolder, { recursive: true });
      await writeFile(source, "media");
      await expect(resolveCompletedDownloadSourcePath(source, {
        mappings: [],
        approvedRoots: [],
        trustedLocalSource: true,
      })).resolves.toBe(await realpath(source));
    } finally {
      await rm(downloadFolder, { recursive: true, force: true });
    }
  });

  it("rejects filesystem roots as mapped target boundaries", async () => {
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "nooklet-mapped-root-"));
    const source = path.join(sandbox, "Movie.mkv");
    const filesystemRoot = path.parse(source).root;
    const sourceRelativeToRoot = path.relative(filesystemRoot, source).split(path.sep).join("/");

    try {
      await writeFile(source, "media");
      await expect(resolveCompletedDownloadSourcePath(
        `/downloads/${sourceRelativeToRoot}`,
        {
          mappings: [{ sourcePrefix: "/downloads", targetPrefix: filesystemRoot }],
          approvedRoots: [],
        },
      )).rejects.toThrow(/filesystem root/i);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });
});
