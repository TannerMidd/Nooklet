import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { findStorageSnapshot, upsertStorageSnapshot } from "./storage-snapshot-repository";

describe("storage-snapshot-repository", () => {
    it("persists freshness and probe metadata", async () => {
        const id = `library-destination:${randomUUID()}`;
        const checkedAt = new Date("2026-07-20T12:00:00.000Z");

        await upsertStorageSnapshot({
            id,
            kind: "library-destination",
            path: "/media/movies",
            exists: true,
            reachable: true,
            readable: true,
            writable: true,
            freeSpaceBytes: 400_000_000_000,
            totalSpaceBytes: 1_000_000_000_000,
            errorMessage: null,
            checkedAt,
        });

        await expect(findStorageSnapshot(id)).resolves.toMatchObject({
            id,
            path: "/media/movies",
            reachable: true,
            freeSpaceBytes: 400_000_000_000,
            checkedAt,
        });
    });

    it("records a failed probe without erasing the last successful capacity", async () => {
        const id = `library-destination:${randomUUID()}`;

        await upsertStorageSnapshot({
            id,
            kind: "library-destination",
            path: "/media/tv",
            exists: true,
            reachable: true,
            readable: true,
            writable: true,
            freeSpaceBytes: 300_000_000_000,
            totalSpaceBytes: 900_000_000_000,
            errorMessage: null,
        });
        await upsertStorageSnapshot({
            id,
            kind: "library-destination",
            path: "/media/tv",
            exists: false,
            reachable: false,
            readable: false,
            writable: false,
            freeSpaceBytes: null,
            totalSpaceBytes: null,
            errorMessage: "Filesystem probe failed (EIO).",
        });

        await expect(findStorageSnapshot(id)).resolves.toMatchObject({
            reachable: false,
            readable: false,
            writable: false,
            freeSpaceBytes: 300_000_000_000,
            totalSpaceBytes: 900_000_000_000,
            errorMessage: "Filesystem probe failed (EIO).",
        });
    });

    it("does not carry capacity across a configured path change", async () => {
        const id = `library-destination:${randomUUID()}`;

        await upsertStorageSnapshot({
            id,
            kind: "library-destination",
            path: "/media/old",
            exists: true,
            reachable: true,
            readable: true,
            writable: true,
            freeSpaceBytes: 300_000_000_000,
            totalSpaceBytes: 900_000_000_000,
            errorMessage: null,
        });
        await upsertStorageSnapshot({
            id,
            kind: "library-destination",
            path: "/media/new",
            exists: false,
            reachable: false,
            readable: false,
            writable: false,
            freeSpaceBytes: null,
            totalSpaceBytes: null,
            errorMessage: "Filesystem probe failed (ENOENT).",
        });

        await expect(findStorageSnapshot(id)).resolves.toMatchObject({
            path: "/media/new",
            freeSpaceBytes: null,
            totalSpaceBytes: null,
        });
    });
});
