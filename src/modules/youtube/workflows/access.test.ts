import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { serviceConnections, serviceSecrets, users } from "@/lib/database/schema";
import { decryptSecret } from "@/lib/security/secret-box";
import type { YtDlpAdapter } from "@/modules/youtube/adapters/yt-dlp";

import { testAndSaveYouTubeAccess, validateYouTubeCookieFile, YouTubeAccessError } from "./access";

const validCookies = [
    "# Netscape HTTP Cookie File",
    ".youtube.com\tTRUE\t/\tTRUE\t0\tSAPISID\tsession-secret",
    "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tlogin-secret",
    "",
].join("\n");

function fakeAdapter() {
    return {
        probe: vi.fn().mockResolvedValue({ eligible: true }),
    } as unknown as YtDlpAdapter;
}

function seedAdmin() {
    const id = randomUUID();

    ensureDatabaseReady()
        .insert(users)
        .values({
            id,
            email: `${id}@youtube-access.test`,
            displayName: "YouTube admin",
            passwordHash: "x",
            role: "admin",
        })
        .run();

    return id;
}

describe("YouTube access cookies", () => {
    beforeEach(() => ensureDatabaseReady());

    it("accepts and normalizes a signed-in YouTube-only Netscape export", () => {
        expect(validateYouTubeCookieFile(validCookies.replace(/\n/g, "\r\n"))).toEqual({
            normalized: validCookies,
            cookieCount: 2,
        });
    });

    it("rejects exports containing unrelated site credentials", () => {
        const mixed = `${validCookies.trim()}\n.example.com\tTRUE\t/\tTRUE\t0\tSID\tother-secret\n`;

        expect(() => validateYouTubeCookieFile(mixed)).toThrowError(YouTubeAccessError);
        expect(() => validateYouTubeCookieFile(mixed)).toThrow(/YouTube-only/);
    });

    it("rejects a guest cookie jar without an account session", () => {
        const guest = [
            "# Netscape HTTP Cookie File",
            ".youtube.com\tTRUE\t/\tTRUE\t0\tVISITOR_INFO1_LIVE\tvisitor",
            "",
        ].join("\n");

        expect(() => validateYouTubeCookieFile(guest)).toThrow(/signed-in YouTube session/);
    });

    it("verifies before storing and persists only encrypted session material", async () => {
        const userId = seedAdmin();
        const adapter = fakeAdapter();

        await expect(testAndSaveYouTubeAccess(userId, validCookies, { adapter })).resolves.toEqual({
            cookieCount: 2,
        });

        const database = ensureDatabaseReady();
        const connection = database
            .select()
            .from(serviceConnections)
            .all()
            .find((item) => item.serviceType === "youtube");
        const secret = connection
            ? database
                  .select()
                  .from(serviceSecrets)
                  .all()
                  .find((item) => item.connectionId === connection.id)
            : null;

        expect(adapter.probe).toHaveBeenCalledWith("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
        expect(connection).toMatchObject({
            ownerUserId: userId,
            serviceType: "youtube",
            status: "verified",
        });
        expect(secret?.encryptedValue).not.toContain("session-secret");
        expect(decryptSecret(secret!.encryptedValue)).toBe(validCookies);
        expect(secret?.maskedValue).toBe("2 YouTube session cookies");
    });

    it("does not save a replacement when the live verification fails", async () => {
        const userId = seedAdmin();
        const before = ensureDatabaseReady()
            .select()
            .from(serviceConnections)
            .all()
            .filter((item) => item.serviceType === "youtube");
        const adapter = {
            probe: vi.fn().mockRejectedValue(new Error("challenge")),
        } as unknown as YtDlpAdapter;

        await expect(testAndSaveYouTubeAccess(userId, validCookies, { adapter })).rejects.toThrow(
            "challenge",
        );
        const after = ensureDatabaseReady()
            .select()
            .from(serviceConnections)
            .all()
            .filter((item) => item.serviceType === "youtube");

        expect(after).toEqual(before);
    });
});
