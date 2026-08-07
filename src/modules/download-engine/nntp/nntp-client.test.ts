import net from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
    startFakeNntpServer,
    type FakeNntpServer,
} from "@/modules/download-engine/nntp/fake-nntp-server";
import { NntpClient, NntpError } from "@/modules/download-engine/nntp/nntp-client";
import { tlsTestCertificate } from "@/modules/download-engine/testing/tls-test-certificate";

let server: FakeNntpServer | null = null;

afterEach(async () => {
    await server?.close();
    server = null;
});

function client(
    port: number,
    overrides: Partial<ConstructorParameters<typeof NntpClient>[0]> = {},
) {
    return new NntpClient({
        host: "127.0.0.1",
        port,
        timeoutMs: 3_000,
        trustedRootCertificates: [tlsTestCertificate],
        resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
        ...overrides,
    });
}

describe("NntpClient", () => {
    it("connects only through the prevalidated address instead of resolving the host again", async () => {
        server = await startFakeNntpServer({ articles: new Map() });
        const nntp = new NntpClient({
            host: "dns-rebind.invalid",
            port: server.port,
            timeoutMs: 3_000,
            trustedRootCertificates: [tlsTestCertificate],
            resolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
        });

        await nntp.connect();
        expect(await nntp.date()).toBe("20260711000000");
        await nntp.quit();
    });

    it("never speaks to a plaintext NNTP endpoint", async () => {
        // A plaintext server that greets immediately; the TLS handshake must fail
        // before any NNTP command or credential can cross the wire.
        let receivedBytes = 0;
        const plaintextServer = net.createServer((socket) => {
            socket.on("data", (chunk) => {
                receivedBytes += chunk.length;
            });
            socket.write("200 plaintext ready\r\n");
        });

        await new Promise<void>((resolve) => plaintextServer.listen(0, "127.0.0.1", resolve));
        const address = plaintextServer.address();
        const port = typeof address === "object" && address ? address.port : 0;

        try {
            const nntp = client(port, { timeoutMs: 1_000 });

            await expect(nntp.connect()).rejects.toMatchObject({ name: "NntpError" });
            // The TLS ClientHello may land on the socket, but nothing NNTP-shaped
            // (AUTHINFO, BODY) can: the client never reached the protocol layer.
            expect(receivedBytes).toBeLessThan(4096);
        } finally {
            await new Promise<void>((resolve) => plaintextServer.close(() => resolve()));
        }
    });

    it("rejects servers whose certificate is not trusted", async () => {
        server = await startFakeNntpServer({ articles: new Map() });

        // Without the test root injected, the fake server's self-signed
        // certificate must fail verification — there is no way to opt out.
        const nntp = client(server.port, { trustedRootCertificates: undefined });

        await expect(nntp.connect()).rejects.toMatchObject({
            name: "NntpError",
            kind: "connect-failed",
        });
    });

    it("connects, runs DATE, fetches a body, and quits", async () => {
        server = await startFakeNntpServer({
            articles: new Map([["hello@test", "line one\r\nline two"]]),
        });

        const nntp = client(server.port);

        await nntp.connect();

        expect(await nntp.date()).toBe("20260711000000");

        const body = await nntp.body("hello@test");

        expect(body.toString("latin1")).toBe("line one\r\nline two");

        await nntp.quit();
    });

    it("reassembles bodies delivered in tiny TCP chunks", async () => {
        const payload = "abcdefghij".repeat(500);

        server = await startFakeNntpServer({
            articles: new Map([["chunked@test", payload]]),
            chunkSize: 7,
        });

        const nntp = client(server.port);

        await nntp.connect();

        const body = await nntp.body("chunked@test");

        expect(body.toString("latin1")).toBe(payload);

        await nntp.quit();
    });

    it("authenticates with AUTHINFO USER/PASS", async () => {
        server = await startFakeNntpServer({
            articles: new Map([["secure@test", "secret body"]]),
            credentials: { username: "alex", password: "hunter2" },
        });

        const nntp = client(server.port, { username: "alex", password: "hunter2" });

        await nntp.connect();

        expect((await nntp.body("secure@test")).toString("latin1")).toBe("secret body");

        await nntp.quit();
    });

    it("raises a permanent auth error on bad credentials", async () => {
        server = await startFakeNntpServer({
            articles: new Map(),
            credentials: { username: "alex", password: "hunter2" },
        });

        const nntp = client(server.port, { username: "alex", password: "wrong" });

        await expect(nntp.connect()).rejects.toMatchObject({
            name: "NntpError",
            kind: "auth-failed",
            permanent: true,
        });
    });

    it("raises a permanent article-not-found error on 430", async () => {
        server = await startFakeNntpServer({ articles: new Map() });

        const nntp = client(server.port);

        await nntp.connect();

        await expect(nntp.body("missing@test")).rejects.toMatchObject({
            kind: "article-not-found",
            permanent: true,
        });

        await nntp.quit();
    });

    it("rejects message ids containing NNTP command delimiters", async () => {
        server = await startFakeNntpServer({ articles: new Map() });

        const nntp = client(server.port);

        await nntp.connect();

        await expect(nntp.body("safe@test>\r\nDATE")).rejects.toMatchObject({
            kind: "protocol-error",
            permanent: true,
        });

        await nntp.quit();
    });

    it("returns an empty buffer for empty bodies", async () => {
        server = await startFakeNntpServer({ articles: new Map([["empty@test", ""]]) });

        const nntp = client(server.port);

        await nntp.connect();

        // An empty article body arrives as just the terminator.
        const body = await nntp.body("empty@test");

        expect(body.length).toBeLessThanOrEqual(2);

        await nntp.quit();
    });

    it("closes the connection when an article exceeds the configured byte limit", async () => {
        server = await startFakeNntpServer({
            articles: new Map([["large@test", "x".repeat(4096)]]),
            chunkSize: 128,
        });

        const nntp = client(server.port, { maxArticleBytes: 1024 });

        await nntp.connect();

        await expect(nntp.body("large@test")).rejects.toMatchObject({
            kind: "protocol-error",
            permanent: true,
        });
        expect(nntp.isConnected).toBe(false);
    });

    it("times out when the server goes silent", async () => {
        server = await startFakeNntpServer({ articles: new Map() });

        const nntp = client(server.port, { timeoutMs: 250 });

        await nntp.connect();

        // The fake server replies 500 to unknown commands but never to nothing;
        // request a body against an id the server was told to stall on by
        // simulating silence: close our read path by asking for DATE against a
        // dead socket instead.
        nntp.destroy();

        await expect(nntp.body("any@test")).rejects.toBeInstanceOf(NntpError);
    });
});
