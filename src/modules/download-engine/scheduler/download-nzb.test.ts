import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { startFakeNntpServer, type FakeNntpServer } from "@/modules/download-engine/nntp/fake-nntp-server";
import { parseNzb } from "@/modules/download-engine/nzb/parse-nzb";
import { downloadNzb } from "@/modules/download-engine/scheduler/download-nzb";
import {
  buildDeterministicPayload,
  buildMultiPartArticles,
  buildSinglePartArticle,
} from "@/modules/download-engine/testing/yenc-encode";

let server: FakeNntpServer | null = null;
let workDir: string | null = null;

afterEach(async () => {
  await server?.close();
  server = null;

  if (workDir) {
    await rm(workDir, { recursive: true, force: true });
    workDir = null;
  }
});

function nzbXml(files: Array<{ subject: string; segmentIds: string[] }>) {
  const fileEntries = files
    .map((file) => {
      const segments = file.segmentIds
        .map((id, index) => `<segment bytes="1000" number="${index + 1}">${id}</segment>`)
        .join("");
      const subject = file.subject.replaceAll('"', "&quot;");

      return `<file poster="tester@example" date="1720000000" subject="${subject}"><groups><group>alt.binaries.test</group></groups><segments>${segments}</segments></file>`;
    })
    .join("");

  return `<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">${fileEntries}</nzb>`;
}

describe("downloadNzb", () => {
  it("assembles multi-part and single-part files byte-for-byte", async () => {
    const moviePayload = buildDeterministicPayload(50_000, 7);
    const infoPayload = buildDeterministicPayload(900, 3);
    const movieArticles = buildMultiPartArticles(moviePayload, "movie.mkv", 4);

    server = await startFakeNntpServer({
      articles: new Map([
        ["movie-1@test", movieArticles[0]],
        ["movie-2@test", movieArticles[1]],
        ["movie-3@test", movieArticles[2]],
        ["movie-4@test", movieArticles[3]],
        ["info-1@test", buildSinglePartArticle(infoPayload, "info.nfo")],
      ]),
      credentials: { username: "user", password: "pass" },
    });

    workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

    const nzb = parseNzb(nzbXml([
      { subject: '"movie.mkv" yEnc (1/4)', segmentIds: ["movie-1@test", "movie-2@test", "movie-3@test", "movie-4@test"] },
      { subject: '"info.nfo" yEnc (1/1)', segmentIds: ["info-1@test"] },
    ]));

    const progressUpdates: number[] = [];
    const result = await downloadNzb({
      nzb,
      server: {
        host: "127.0.0.1",
        port: server.port,
        tls: false,
        username: "user",
        password: "pass",
        connections: 3,
        timeoutMs: 3_000,
      },
      workDir,
      onProgress: (progress) => progressUpdates.push(progress.completedSegments),
    });

    expect(result.ok).toBe(true);
    expect(result.aborted).toBe(false);
    expect(result.completedSegments).toBe(5);
    expect(result.failedSegments).toBe(0);

    const movieFile = result.files.find((file) => file.fileName === "movie.mkv");
    const infoFile = result.files.find((file) => file.fileName === "info.nfo");

    expect(movieFile?.ok).toBe(true);
    expect(infoFile?.ok).toBe(true);

    const assembledMovie = await readFile(movieFile!.filePath!);
    const assembledInfo = await readFile(infoFile!.filePath!);

    expect(assembledMovie.equals(moviePayload)).toBe(true);
    expect(assembledInfo.equals(infoPayload)).toBe(true);
    expect(progressUpdates.at(-1)).toBe(5);
  });

  it("marks files with missing articles as damaged without failing others", async () => {
    const goodPayload = buildDeterministicPayload(2_000, 1);
    const partialPayload = buildDeterministicPayload(4_000, 2);
    const partialArticles = buildMultiPartArticles(partialPayload, "partial.bin", 2);

    server = await startFakeNntpServer({
      articles: new Map([
        ["good-1@test", buildSinglePartArticle(goodPayload, "good.bin")],
        ["partial-1@test", partialArticles[0]],
        // partial-2@test intentionally missing → 430
      ]),
    });

    workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

    const nzb = parseNzb(nzbXml([
      { subject: '"good.bin"', segmentIds: ["good-1@test"] },
      { subject: '"partial.bin"', segmentIds: ["partial-1@test", "partial-2@test"] },
    ]));

    const result = await downloadNzb({
      nzb,
      server: { host: "127.0.0.1", port: server.port, tls: false, connections: 2, timeoutMs: 3_000 },
      workDir,
    });

    expect(result.ok).toBe(false);
    expect(result.aborted).toBe(false);
    expect(result.failedSegments).toBe(1);

    const goodFile = result.files.find((file) => file.fileName === "good.bin");
    const partialFile = result.files.find((file) => file.subject === '"partial.bin"');

    expect(goodFile?.ok).toBe(true);
    expect((await readFile(goodFile!.filePath!)).equals(goodPayload)).toBe(true);
    expect(partialFile?.ok).toBe(false);
    expect(partialFile?.failedSegments).toBe(1);
  });

  it("stops promptly when aborted", async () => {
    const payload = buildDeterministicPayload(1_000, 5);
    const articles = new Map<string, string>();
    const segmentIds: string[] = [];

    for (let index = 0; index < 24; index += 1) {
      const id = `seg-${index}@test`;
      segmentIds.push(id);
      articles.set(id, buildSinglePartArticle(payload, `file-${index}.bin`));
    }

    server = await startFakeNntpServer({ articles });
    workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

    const nzb = parseNzb(nzbXml(segmentIds.map((id, index) => ({
      subject: `"file-${index}.bin"`,
      segmentIds: [id],
    }))));

    let fetched = 0;
    const result = await downloadNzb({
      nzb,
      server: { host: "127.0.0.1", port: server.port, tls: false, connections: 1, timeoutMs: 3_000 },
      workDir,
      onProgress: () => {
        fetched += 1;
      },
      shouldAbort: () => fetched >= 3,
    });

    expect(result.aborted).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.completedSegments).toBeLessThan(24);
  });
});
