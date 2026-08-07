import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    IsolatedFilesystemPolicyError,
    resolveApprovedMediaDirectoryIsolated,
} from "./isolated-filesystem-policy";

describe("resolveApprovedMediaDirectoryIsolated", () => {
    it("returns the canonical path for a directory inside an approved root", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-approved-root-"));
        const candidate = path.join(root, "TV");

        fs.mkdirSync(candidate);

        await expect(resolveApprovedMediaDirectoryIsolated(candidate, [root])).resolves.toBe(
            fs.realpathSync.native(candidate),
        );
    });

    it("rejects a directory outside the approved roots", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-approved-root-"));
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-outside-root-"));

        await expect(resolveApprovedMediaDirectoryIsolated(outside, [root])).rejects.toMatchObject({
            name: "IsolatedFilesystemPolicyError",
            code: "invalid",
        });
    });

    it("abandons a wedged validator without waiting for the child to exit", async () => {
        const startedAt = Date.now();
        const helperPath = path.join(
            process.cwd(),
            "src",
            "lib",
            "security",
            "fixtures",
            "hanging-filesystem-helper.mjs",
        );

        await expect(
            resolveApprovedMediaDirectoryIsolated(os.tmpdir(), [os.tmpdir()], 50, helperPath),
        ).rejects.toEqual(
            expect.objectContaining<Partial<IsolatedFilesystemPolicyError>>({
                code: "timeout",
            }),
        );
        expect(Date.now() - startedAt).toBeLessThan(1_000);
    });
});
