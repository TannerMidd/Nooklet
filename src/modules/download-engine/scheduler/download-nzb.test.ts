import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, rm } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
    startFakeNntpServer,
    type FakeNntpServer,
} from "@/modules/download-engine/nntp/fake-nntp-server";
import { NntpError } from "@/modules/download-engine/nntp/nntp-client";
import { parseNzb } from "@/modules/download-engine/nzb/parse-nzb";
import { downloadNzb } from "@/modules/download-engine/scheduler/download-nzb";
import {
    buildDeterministicPayload,
    buildMultiPartArticles,
    buildSinglePartArticle,
} from "@/modules/download-engine/testing/yenc-encode";
import { tlsTestCertificate } from "@/modules/download-engine/testing/tls-test-certificate";

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
                .map(
                    (id, index) =>
                        `<segment bytes="10000000" number="${index + 1}">${id}</segment>`,
                )
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

        const nzb = parseNzb(
            nzbXml([
                {
                    subject: '"movie.mkv" yEnc (1/4)',
                    segmentIds: ["movie-1@test", "movie-2@test", "movie-3@test", "movie-4@test"],
                },
                { subject: '"info.nfo" yEnc (1/1)', segmentIds: ["info-1@test"] },
            ]),
        );

        const progressUpdates: number[] = [];
        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                username: "user",
                password: "pass",
                connections: 3,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
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

    it("assembles an obfuscated post whose every article declares a different yEnc name", async () => {
        // Modern obfuscated releases randomize the yEnc name per article. Only the
        // NZB <file> grouping identifies the file, so treating the name as identity
        // rejected every part but the first and condemned the whole release.
        const payload = buildDeterministicPayload(40_000, 11);
        const articles = buildMultiPartArticles(
            payload,
            (partNumber) => `${"0123456789abcdef".repeat(3)}-${partNumber}`,
            6,
        );
        const segmentIds = articles.map((_, index) => `obf-${index + 1}@test`);

        server = await startFakeNntpServer({
            articles: new Map(articles.map((article, index) => [segmentIds[index], article])),
        });

        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const nzb = parseNzb(nzbXml([{ subject: '"01f3ba9c.par2" yEnc (1/6)', segmentIds }]));

        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 4,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
        });

        expect(result.ok).toBe(true);
        expect(result.completedSegments).toBe(6);
        expect(result.failedSegments).toBe(0);
        expect(result.transportExhausted).toBe(false);
        expect(result.failureKinds).toEqual([]);

        const assembled = await readFile(result.files[0]!.filePath!);

        expect(assembled.equals(payload)).toBe(true);
    });

    it("still rejects articles that disagree on the file size the parts belong to", async () => {
        const payload = buildDeterministicPayload(20_000, 5);
        const articles = buildMultiPartArticles(payload, "real.bin", 2);
        // Same file entry, but the second article claims a different total size —
        // genuine evidence the parts are not one file, unlike a rotating name.
        const mismatched = articles[1]!.replace(
            `size=${payload.length} name=`,
            `size=${payload.length + 4_096} name=`,
        );

        server = await startFakeNntpServer({
            articles: new Map([
                ["size-1@test", articles[0]!],
                ["size-2@test", mismatched],
            ]),
        });

        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const nzb = parseNzb(
            nzbXml([{ subject: '"real.bin"', segmentIds: ["size-1@test", "size-2@test"] }]),
        );

        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 1,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
        });

        expect(result.ok).toBe(false);
        expect(result.failedSegments).toBe(1);
        // Evidence about the post, not the connection: it must never read as a
        // transport failure, or the caller stops looking for another release.
        expect(result.failureKinds).toEqual(["article-unusable"]);
        expect(result.transportExhausted).toBe(false);
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

        const nzb = parseNzb(
            nzbXml([
                { subject: '"good.bin"', segmentIds: ["good-1@test"] },
                { subject: '"partial.bin"', segmentIds: ["partial-1@test", "partial-2@test"] },
            ]),
        );

        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 2,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
        });

        expect(result.ok).toBe(false);
        expect(result.aborted).toBe(false);
        expect(result.failedSegments).toBe(1);
        expect(result.failureKinds).toEqual(["article-not-found"]);

        const goodFile = result.files.find((file) => file.fileName === "good.bin");
        const partialFile = result.files.find((file) => file.subject === '"partial.bin"');

        expect(goodFile?.ok).toBe(true);
        expect((await readFile(goodFile!.filePath!)).equals(goodPayload)).toBe(true);
        expect(partialFile?.ok).toBe(false);
        expect(partialFile?.failedSegments).toBe(1);
    });

    it("abandons a partly removed release from the probe before fetching bodies", async () => {
        // Enough articles answer STAT to prove the server serves this release, and
        // the rest are gone well past any recovery budget. That is the only shape
        // a probe verdict is trustworthy for.
        const payload = buildDeterministicPayload(500, 4);
        const articles = new Map<string, string>();
        const files = Array.from({ length: 60 }, (_, index) => ({
            subject: `"probe-${index}.bin"`,
            segmentIds: [`probe-${index}@test`],
        }));

        for (let index = 0; index < 6; index += 1) {
            articles.set(
                `probe-${index}@test`,
                buildSinglePartArticle(payload, `probe-${index}.bin`),
            );
        }

        server = await startFakeNntpServer({ articles });
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const result = await downloadNzb({
            nzb: parseNzb(nzbXml(files)),
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 4,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
        });

        expect(result.unrecoverable).toBe(true);
        expect(result.aborted).toBe(false);
        expect(result.ok).toBe(false);
        expect(result.downloadedBytes).toBe(0);
        expect(result.completedSegments).toBe(0);
        expect(result.failedSegments).toBe(0);
    });

    it("abandons a wholly removed release at the probe, without transferring anything", async () => {
        // Every article gone: STAT says so and BODY confirms it. Previously the
        // all-missing sample was treated as unproven, so the release had to fail
        // article by article until byte accounting reached the same verdict —
        // thousands of round trips for the cheapest case to diagnose.
        server = await startFakeNntpServer({ articles: new Map() });
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const nzb = parseNzb(
            nzbXml(
                Array.from({ length: 60 }, (_, index) => ({
                    subject: `"probe-${index}.bin"`,
                    segmentIds: [`probe-${index}@test`],
                })),
            ),
        );

        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 4,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
        });

        expect(result.unrecoverable).toBe(true);
        expect(result.failureKinds).toEqual(["article-not-found"]);
        // The verdict came from the probe, so no segment ever entered the transfer.
        expect(result.failedSegments).toBe(0);
        expect(result.completedSegments).toBe(0);
        expect(result.downloadedBytes).toBe(0);
    });

    it("does not abandon a downloadable release when only STAT reports it missing", async () => {
        // The case the all-missing guard exists for: a server that answers "gone"
        // to every STAT while serving the articles perfectly well. Condemning here
        // would discard every candidate for an item without transferring a byte.
        const payload = buildDeterministicPayload(400, 9);
        const articles = new Map(
            Array.from({ length: 60 }, (_, index) => [
                `probe-${index}@test`,
                buildSinglePartArticle(payload, `probe-${index}.bin`),
            ]),
        );

        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const nzb = parseNzb(
            nzbXml(
                Array.from({ length: 60 }, (_, index) => ({
                    subject: `"probe-${index}.bin"`,
                    segmentIds: [`probe-${index}@test`],
                })),
            ),
        );

        let statCalls = 0;
        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: 1,
                connections: 2,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
            clientFactory: () => ({
                connect: async () => undefined,
                stat: async () => {
                    statCalls += 1;

                    return false;
                },
                body: async (id: string) => Buffer.from(articles.get(id)!, "latin1"),
                quit: async () => undefined,
                destroy: () => undefined,
            }),
        });

        expect(statCalls).toBeGreaterThan(0);
        expect(result.unrecoverable).toBe(false);
        expect(result.ok).toBe(true);
        expect(result.completedSegments).toBe(60);
        expect(result.failedSegments).toBe(0);
    });

    it("treats a transient authentication requirement during the probe as inconclusive", async () => {
        const payload = buildDeterministicPayload(400, 13);
        const articles = new Map(
            Array.from({ length: 40 }, (_, index) => [
                `reauth-probe-${index}@test`,
                buildSinglePartArticle(payload, `reauth-probe-${index}.bin`),
            ]),
        );

        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));
        let statCalls = 0;

        const result = await downloadNzb({
            nzb: parseNzb(
                nzbXml(
                    Array.from({ length: 40 }, (_, index) => ({
                        subject: `"reauth-probe-${index}.bin"`,
                        segmentIds: [`reauth-probe-${index}@test`],
                    })),
                ),
            ),
            server: {
                host: "127.0.0.1",
                port: 1,
                connections: 2,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
            clientFactory: () => ({
                connect: async () => undefined,
                stat: async () => {
                    statCalls += 1;

                    throw new NntpError(
                        "auth-failed",
                        "STAT requires authentication: 480 authentication required",
                    );
                },
                body: async (id: string) => Buffer.from(articles.get(id)!, "latin1"),
                quit: async () => undefined,
                destroy: () => undefined,
            }),
        });

        expect(statCalls).toBeGreaterThan(0);
        expect(result.unrecoverable).toBe(false);
        expect(result.completedSegments).toBe(40);
        expect(result.failedSegments).toBe(0);
        expect(result.ok).toBe(true);
    });

    it("blames the server, not the release, when transport keeps failing", async () => {
        // Articles the server has, but every BODY loses its connection. The
        // release must not be condemned: that verdict blocklists it and sends the
        // caller through every other candidate for the same episode.
        const nzb = parseNzb(
            nzbXml(
                Array.from({ length: 80 }, (_, index) => ({
                    subject: `"flaky-${index}.bin"`,
                    segmentIds: [`flaky-${index}@test`],
                })),
            ),
        );

        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        let connectCount = 0;
        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: 1,
                connections: 4,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
            clientFactory: () => ({
                connect: async () => {
                    connectCount += 1;
                },
                stat: async () => true,
                body: async () => {
                    throw new NntpError("connection-closed", "BODY connection dropped.");
                },
                quit: async () => undefined,
                destroy: () => undefined,
            }),
        });

        expect(result.transportExhausted).toBe(true);
        expect(result.unrecoverable).toBe(false);
        expect(result.ok).toBe(false);
        expect(result.failureKinds).toEqual(["connection-closed"]);
        // Every failure threw away its connection instead of reusing a stream that
        // may be desynced, so reconnects far outnumber the four workers.
        expect(connectCount).toBeGreaterThan(4);
    });

    it("does not retry a deterministic protocol error", async () => {
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));
        let connectCount = 0;
        let bodyCount = 0;

        const result = await downloadNzb({
            nzb: parseNzb(nzbXml([{ subject: '"broken.bin"', segmentIds: ["broken@test"] }])),
            server: {
                host: "127.0.0.1",
                port: 1,
                connections: 1,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
            maxRetriesPerSegment: 5,
            clientFactory: () => ({
                connect: async () => {
                    connectCount += 1;
                },
                stat: async () => true,
                body: async () => {
                    bodyCount += 1;

                    throw new NntpError("protocol-error", "Malformed BODY framing.");
                },
                quit: async () => undefined,
                destroy: () => undefined,
            }),
        });

        expect(connectCount).toBe(1);
        expect(bodyCount).toBe(1);
        expect(result.failedSegments).toBe(1);
        expect(result.failureKinds).toEqual(["protocol-error"]);
        expect(result.transportExhausted).toBe(false);
        expect(result.unrecoverable).toBe(false);
    });

    it("retries a transient transfer failure without condemning the release", async () => {
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));
        const article = buildSinglePartArticle(buildDeterministicPayload(1_000, 11), "retry.bin");
        let connectCount = 0;
        let bodyCount = 0;

        const result = await downloadNzb({
            nzb: parseNzb(nzbXml([{ subject: '"retry.bin"', segmentIds: ["retry@test"] }])),
            server: {
                host: "127.0.0.1",
                port: 1,
                connections: 1,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
            maxRetriesPerSegment: 1,
            clientFactory: () => ({
                connect: async () => {
                    connectCount += 1;
                },
                stat: async () => true,
                body: async () => {
                    bodyCount += 1;

                    if (bodyCount === 1) {
                        throw new NntpError("timeout", "temporary transfer timeout");
                    }

                    return Buffer.from(article, "latin1");
                },
                quit: async () => undefined,
                destroy: () => undefined,
            }),
        });

        expect(connectCount).toBe(2);
        expect(bodyCount).toBe(2);
        expect(result.completedSegments).toBe(1);
        expect(result.failedSegments).toBe(0);
        expect(result.transportExhausted).toBe(false);
        expect(result.ok).toBe(true);
    });

    it("reconnects after BODY requires authentication again", async () => {
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));
        const article = buildSinglePartArticle(buildDeterministicPayload(1_000, 19), "reauth.bin");
        let connectCount = 0;
        let bodyCount = 0;

        const result = await downloadNzb({
            nzb: parseNzb(nzbXml([{ subject: '"reauth.bin"', segmentIds: ["reauth@test"] }])),
            server: {
                host: "127.0.0.1",
                port: 1,
                connections: 1,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
            maxRetriesPerSegment: 1,
            clientFactory: () => ({
                connect: async () => {
                    connectCount += 1;
                },
                stat: async () => true,
                body: async () => {
                    bodyCount += 1;

                    if (bodyCount === 1) {
                        throw new NntpError(
                            "auth-failed",
                            "BODY requires authentication: 480 authentication required",
                        );
                    }

                    return Buffer.from(article, "latin1");
                },
                quit: async () => undefined,
                destroy: () => undefined,
            }),
        });

        expect(connectCount).toBe(2);
        expect(bodyCount).toBe(2);
        expect(result.completedSegments).toBe(1);
        expect(result.failedSegments).toBe(0);
        expect(result.failureKinds).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it("does not reconnect after cancellation between a transient failure and retry", async () => {
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));
        let callerCanceled = false;
        let connectCount = 0;
        let bodyCount = 0;

        const result = await downloadNzb({
            nzb: parseNzb(nzbXml([{ subject: '"cancel.bin"', segmentIds: ["cancel@test"] }])),
            server: {
                host: "127.0.0.1",
                port: 1,
                connections: 1,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
            maxRetriesPerSegment: 3,
            shouldAbort: () => callerCanceled,
            clientFactory: () => ({
                connect: async () => {
                    connectCount += 1;
                },
                stat: async () => true,
                body: async () => {
                    bodyCount += 1;
                    callerCanceled = true;

                    throw new NntpError("timeout", "temporary transfer timeout");
                },
                quit: async () => undefined,
                destroy: () => undefined,
            }),
        });

        expect(connectCount).toBe(1);
        expect(bodyCount).toBe(1);
        expect(result.aborted).toBe(true);
        expect(result.deadlineExceeded).toBe(false);
        expect(result.transportExhausted).toBe(false);
        expect(result.completedSegments).toBe(0);
    });

    it("prefers caller cancellation when a transient failure lands at the deadline", async () => {
        vi.useFakeTimers();

        try {
            workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));
            let callerCanceled = false;
            let connectCount = 0;
            let bodyCount = 0;
            const deadlineAt = Date.now() + 100;

            const resultPromise = downloadNzb({
                nzb: parseNzb(
                    nzbXml([{ subject: '"boundary.bin"', segmentIds: ["boundary@test"] }]),
                ),
                server: { host: "news.invalid", port: 563, connections: 1 },
                workDir,
                deadlineAt,
                shouldAbort: () => callerCanceled,
                clientFactory: () => ({
                    connect: async () => {
                        connectCount += 1;
                    },
                    stat: async () => true,
                    body: async () => {
                        bodyCount += 1;
                        callerCanceled = true;
                        vi.setSystemTime(deadlineAt);

                        throw new NntpError("timeout", "temporary transfer timeout");
                    },
                    quit: async () => undefined,
                    destroy: () => undefined,
                }),
            });

            const result = await resultPromise;

            expect(connectCount).toBe(1);
            expect(bodyCount).toBe(1);
            expect(result.aborted).toBe(true);
            expect(result.deadlineExceeded).toBe(false);
            expect(result.transportExhausted).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it("lets a fully available release pass the probe and download normally", async () => {
        const payload = buildDeterministicPayload(500, 4);
        const articles = new Map<string, string>();
        const files: Array<{ subject: string; segmentIds: string[] }> = [];

        for (let index = 0; index < 60; index += 1) {
            const id = `healthy-${index}@test`;

            articles.set(id, buildSinglePartArticle(payload, `healthy-${index}.bin`));
            files.push({ subject: `"healthy-${index}.bin"`, segmentIds: [id] });
        }

        server = await startFakeNntpServer({ articles });
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const result = await downloadNzb({
            nzb: parseNzb(nzbXml(files)),
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 4,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
        });

        expect(result.unrecoverable).toBe(false);
        expect(result.ok).toBe(true);
        expect(result.completedSegments).toBe(60);
    });

    it("abandons the release once lost data exceeds its PAR2 recovery capacity", async () => {
        // Every declared segment is 10 MB. One 10 MB PAR2 volume can repair at
        // most one lost data segment; the second loss proves the release dead.
        server = await startFakeNntpServer({ articles: new Map() });
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const nzb = parseNzb(
            nzbXml([
                {
                    subject: '"movie.mkv" yEnc (1/10)',
                    segmentIds: Array.from({ length: 10 }, (_, index) => `movie-${index + 1}@test`),
                },
                { subject: '"movie.vol000+01.par2" yEnc (1/1)', segmentIds: ["par2-1@test"] },
            ]),
        );

        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 1,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
        });

        expect(result.unrecoverable).toBe(true);
        expect(result.aborted).toBe(false);
        expect(result.ok).toBe(false);
        expect(result.failedSegments).toBe(2);
        expect(result.completedSegments).toBe(0);
        expect(result.failureKinds).toEqual(["article-not-found"]);
    });

    it("keeps downloading while a PAR2 recovery set can still repair the damage", async () => {
        const dataPayload = buildDeterministicPayload(4_000, 2);
        const dataArticles = buildMultiPartArticles(dataPayload, "movie.mkv", 2);
        const par2Payload = buildDeterministicPayload(2_000, 6);

        server = await startFakeNntpServer({
            articles: new Map([
                ["movie-1@test", dataArticles[0]],
                // movie-2@test intentionally missing → one 10 MB declared loss.
                ["par2-1@test", buildSinglePartArticle(par2Payload, "movie.vol000+01.par2")],
                ["par2-2@test", buildSinglePartArticle(par2Payload, "movie.vol001+02.par2")],
            ]),
        });
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const nzb = parseNzb(
            nzbXml([
                { subject: '"movie.mkv" yEnc (1/2)', segmentIds: ["movie-1@test", "movie-2@test"] },
                { subject: '"movie.vol000+01.par2" yEnc (1/1)', segmentIds: ["par2-1@test"] },
                { subject: '"movie.vol001+02.par2" yEnc (1/1)', segmentIds: ["par2-2@test"] },
            ]),
        );

        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 1,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
        });

        // 10 MB lost vs 20 MB of declared recovery volumes: still repairable, so
        // every remaining segment must have been attempted.
        expect(result.unrecoverable).toBe(false);
        expect(result.failedSegments).toBe(1);
        expect(result.completedSegments).toBe(3);
    });

    it("abandons a release without visible PAR2 once losses pass the hidden-recovery allowance", async () => {
        const payload = buildDeterministicPayload(1_000, 8);
        const articles = new Map<string, string>();

        // 12 single-segment files → 120 MB declared, 12 MB hidden allowance.
        // The first two files are missing; their 20 MB loss crosses the line.
        for (let index = 2; index < 12; index += 1) {
            articles.set(`obf-${index}@test`, buildSinglePartArticle(payload, `obf-${index}.bin`));
        }

        server = await startFakeNntpServer({ articles });
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const nzb = parseNzb(
            nzbXml(
                Array.from({ length: 12 }, (_, index) => ({
                    subject: `"obf-${index}.bin"`,
                    segmentIds: [`obf-${index}@test`],
                })),
            ),
        );

        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 1,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
        });

        expect(result.unrecoverable).toBe(true);
        expect(result.failedSegments).toBe(2);
        expect(result.completedSegments).toBe(0);
    });

    it("preserves an exhausted connection failure for the engine classifier", async () => {
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const result = await downloadNzb({
            nzb: parseNzb(nzbXml([{ subject: '"unreachable.mkv"', segmentIds: ["segment@test"] }])),
            server: { host: "news.invalid", port: 563, connections: 1 },
            workDir,
            maxRetriesPerSegment: 0,
            clientFactory: () => ({
                connect: async () => {
                    throw new NntpError("connect-failed", "Connection refused.");
                },
                body: async () => Buffer.alloc(0),
                stat: async () => true,
                quit: async () => undefined,
                destroy: () => undefined,
            }),
        });

        expect(result.completedSegments).toBe(0);
        expect(result.failedSegments).toBe(1);
        expect(result.failureKinds).toEqual(["connect-failed"]);
    });

    it("preserves authentication failures as typed terminal errors", async () => {
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        await expect(
            downloadNzb({
                nzb: parseNzb(nzbXml([{ subject: '"private.mkv"', segmentIds: ["segment@test"] }])),
                server: { host: "news.invalid", port: 563, connections: 1 },
                workDir,
                clientFactory: () => ({
                    connect: async () => {
                        throw new NntpError("auth-failed", "Authentication rejected.", true);
                    },
                    body: async () => Buffer.alloc(0),
                    stat: async () => true,
                    quit: async () => undefined,
                    destroy: () => undefined,
                }),
            }),
        ).rejects.toMatchObject({ kind: "auth-failed" });
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

        const nzb = parseNzb(
            nzbXml(
                segmentIds.map((id, index) => ({
                    subject: `"file-${index}.bin"`,
                    segmentIds: [id],
                })),
            ),
        );

        let fetched = 0;
        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 1,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
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

    it("stops and reports deadlineExceeded once the wall-clock deadline passes", async () => {
        const payload = buildDeterministicPayload(1_000, 5);
        const articles = new Map<string, string>();
        const segmentIds: string[] = [];

        for (let index = 0; index < 12; index += 1) {
            const id = `seg-${index}@test`;

            segmentIds.push(id);
            articles.set(id, buildSinglePartArticle(payload, `file-${index}.bin`));
        }

        server = await startFakeNntpServer({ articles });
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const nzb = parseNzb(
            nzbXml(
                segmentIds.map((id, index) => ({
                    subject: `"file-${index}.bin"`,
                    segmentIds: [id],
                })),
            ),
        );

        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 1,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
            deadlineAt: Date.now() - 1,
        });

        expect(result.deadlineExceeded).toBe(true);
        expect(result.aborted).toBe(true);
        expect(result.ok).toBe(false);
        expect(result.completedSegments).toBeLessThan(12);
    });

    it("destroys in-flight clients when the watchdog fires mid-article", async () => {
        const payload = buildDeterministicPayload(1_000, 5);
        const articles = new Map<string, string>();

        for (let index = 0; index < 6; index += 1) {
            articles.set(`seg-${index}@test`, buildSinglePartArticle(payload, `f-${index}.bin`));
        }

        server = await startFakeNntpServer({ articles });
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const destroyed: number[] = [];
        let releaseBody: ((error: NntpError) => void) | null = null;

        const nzb = parseNzb(
            nzbXml(
                Array.from(articles.keys()).map((id, index) => ({
                    subject: `"f-${index}.bin"`,
                    segmentIds: [id],
                })),
            ),
        );

        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 1,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
            deadlineAt: Date.now() + 150,
            clientFactory: () => ({
                connect: async () => undefined,
                stat: async () => true,
                quit: async () => undefined,
                destroy: () => {
                    destroyed.push(Date.now());
                    releaseBody?.(new NntpError("connection-closed", "destroyed by watchdog"));
                },
                body: () =>
                    new Promise<Buffer>((_resolve, reject) => {
                        releaseBody = reject;
                    }),
            }),
        });

        expect(result.deadlineExceeded).toBe(true);
        expect(result.aborted).toBe(true);
        expect(result.ok).toBe(false);
        expect(destroyed.length).toBeGreaterThanOrEqual(1);
    });

    it("keeps explicit cancellation distinct while QUIT cleanup is stalled", async () => {
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));
        let abortRequested = false;
        let destroyed = 0;

        const result = await downloadNzb({
            nzb: parseNzb(
                nzbXml([
                    { subject: '"first.bin"', segmentIds: ["first@test"] },
                    { subject: '"second.bin"', segmentIds: ["second@test"] },
                ]),
            ),
            server: {
                host: "127.0.0.1",
                port: 0,
                connections: 1,
                timeoutMs: 3_000,
            },
            workDir,
            deadlineAt: Date.now() + 150,
            onProgress: () => {
                abortRequested = true;
            },
            shouldAbort: () => abortRequested,
            clientFactory: () => ({
                connect: async () => undefined,
                stat: async () => true,
                body: async (messageId: string) =>
                    Buffer.from(
                        buildSinglePartArticle(
                            buildDeterministicPayload(1_000, messageId === "first@test" ? 1 : 2),
                            messageId === "first@test" ? "first.bin" : "second.bin",
                        ),
                        "latin1",
                    ),
                quit: () => new Promise<void>(() => undefined),
                destroy: () => {
                    destroyed += 1;
                },
            }),
        });

        expect(result.aborted).toBe(true);
        expect(result.deadlineExceeded).toBe(false);
        expect(result.completedSegments).toBe(1);
        expect(destroyed).toBeGreaterThanOrEqual(1);
    });

    it("keeps distinct NZB files separate when yEnc names sanitize to the same path", async () => {
        const first = buildDeterministicPayload(1000, 1);
        const second = buildDeterministicPayload(1000, 2);

        server = await startFakeNntpServer({
            articles: new Map([
                ["first@test", buildSinglePartArticle(first, "same:name.mkv")],
                ["second@test", buildSinglePartArticle(second, "same?name.mkv")],
            ]),
        });
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const result = await downloadNzb({
            nzb: parseNzb(
                nzbXml([
                    { subject: '"first.mkv"', segmentIds: ["first@test"] },
                    { subject: '"second.mkv"', segmentIds: ["second@test"] },
                ]),
            ),
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 2,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
        });

        expect(result.ok).toBe(true);
        expect(new Set(result.files.map((file) => file.fileName)).size).toBe(2);
        const assembled = await Promise.all(result.files.map((file) => readFile(file.filePath!)));

        expect(assembled.some((value) => value.equals(first))).toBe(true);
        expect(assembled.some((value) => value.equals(second))).toBe(true);
    });

    it("rejects multipart metadata that proves the NZB omitted a part", async () => {
        const payload = buildDeterministicPayload(3000, 4);
        const articles = buildMultiPartArticles(payload, "partial.mkv", 3);

        server = await startFakeNntpServer({
            articles: new Map([
                ["part-1@test", articles[0]],
                ["part-3@test", articles[2]],
            ]),
        });
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const result = await downloadNzb({
            nzb: parseNzb(
                nzbXml([{ subject: '"partial.mkv"', segmentIds: ["part-1@test", "part-3@test"] }]),
            ),
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 2,
                timeoutMs: 3_000,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
        });

        expect(result.ok).toBe(false);
        expect(result.files[0]?.ok).toBe(false);
        expect(result.failedSegments).toBe(2);
    });

    it("rejects a yEnc file larger than the NZB-declared file size", async () => {
        const payload = buildDeterministicPayload(2_000, 9);

        server = await startFakeNntpServer({
            articles: new Map([
                ["oversized@test", buildSinglePartArticle(payload, "oversized.mkv")],
            ]),
        });
        workDir = await mkdtemp(path.join(os.tmpdir(), "nooklet-engine-"));

        const nzb = parseNzb(
            `<nzb><file subject="oversized"><segments><segment bytes="1000" number="1">oversized@test</segment></segments></file></nzb>`,
        );
        const result = await downloadNzb({
            nzb,
            server: {
                host: "127.0.0.1",
                port: server.port,
                trustedRootCertificates: [tlsTestCertificate],
                connections: 1,
                resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
            },
            workDir,
        });

        expect(result.ok).toBe(false);
        expect(result.failedSegments).toBe(1);
        expect(result.files[0]?.filePath).toBeNull();
    });
});
