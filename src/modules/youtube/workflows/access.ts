import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/security/secret-box";
import { createYtDlpAdapter, type YtDlpAdapter } from "@/modules/youtube/adapters/yt-dlp";
import { createYouTubeCookieLeaseFromText } from "@/modules/youtube/runtime/cookie-lease";
import {
    deleteServiceConnection,
    findServiceConnectionByType,
    saveServiceConnection,
    updateServiceConnectionVerification,
} from "@/modules/service-connections/public";

const maximumCookieFileBytes = 512 * 1024;
const verificationVideoUrl = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";

export class YouTubeAccessError extends Error {
    constructor(
        message: string,
        public readonly field: "cookiesFile" | null = null,
    ) {
        super(message);
        this.name = "YouTubeAccessError";
    }
}

function isYouTubeCookieDomain(domain: string) {
    const normalized = domain
        .toLowerCase()
        .replace(/^#httponly_/i, "")
        .replace(/^\./, "");

    return normalized === "youtube.com" || normalized.endsWith(".youtube.com");
}

export function validateYouTubeCookieFile(cookiesText: string) {
    const size = Buffer.byteLength(cookiesText, "utf8");

    if (size === 0 || size > maximumCookieFileBytes) {
        throw new YouTubeAccessError(
            "Choose a non-empty YouTube cookies.txt file no larger than 512 KB.",
            "cookiesFile",
        );
    }

    const normalized = cookiesText
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n")
        .trim();
    const lines = normalized.split("\n");
    const firstLine = lines[0]?.trim().toLowerCase();

    if (firstLine !== "# netscape http cookie file" && firstLine !== "# http cookie file") {
        throw new YouTubeAccessError(
            "Export cookies.txt in Netscape format; its first line must identify an HTTP cookie file.",
            "cookiesFile",
        );
    }

    let cookieCount = 0;
    let hasAccountSessionCookie = false;

    for (const [index, rawLine] of lines.entries()) {
        const line = rawLine.trim();

        if (!line || (line.startsWith("#") && !line.toLowerCase().startsWith("#httponly_"))) {
            continue;
        }

        const fields = rawLine.split("\t");

        if (fields.length !== 7 || !isYouTubeCookieDomain(fields[0] ?? "")) {
            throw new YouTubeAccessError(
                `Line ${index + 1} is not a valid YouTube-only Netscape cookie entry.`,
                "cookiesFile",
            );
        }

        const name = fields[5]?.trim() ?? "";

        if (!name) {
            throw new YouTubeAccessError(`Line ${index + 1} has no cookie name.`, "cookiesFile");
        }

        cookieCount += 1;
        hasAccountSessionCookie ||= new Set([
            "SAPISID",
            "__Secure-1PAPISID",
            "__Secure-3PAPISID",
            "LOGIN_INFO",
            "SID",
        ]).has(name);
    }

    if (cookieCount === 0 || !hasAccountSessionCookie) {
        throw new YouTubeAccessError(
            "This file does not contain a signed-in YouTube session. Export youtube.com cookies after signing in.",
            "cookiesFile",
        );
    }

    return { normalized: `${normalized}\n`, cookieCount };
}

function adapterForCookieText(cookiesText: string) {
    return createYtDlpAdapter({
        cookieLeaseProvider: () => createYouTubeCookieLeaseFromText(cookiesText),
    });
}

async function verifyAdapter(adapter: YtDlpAdapter) {
    const video = await adapter.probe(verificationVideoUrl);

    if (!video.eligible) {
        throw new YouTubeAccessError("YouTube access verification returned an ineligible video.");
    }
}

export async function testAndSaveYouTubeAccess(
    userId: string,
    cookiesText: string,
    options: { adapter?: YtDlpAdapter } = {},
) {
    const validated = validateYouTubeCookieFile(cookiesText);

    await verifyAdapter(options.adapter ?? adapterForCookieText(validated.normalized));
    await saveServiceConnection({
        userId,
        serviceType: "youtube",
        displayName: "YouTube access",
        baseUrl: "https://www.youtube.com",
        status: "verified",
        statusMessage: "Authenticated YouTube extraction verified.",
        metadata: { cookieCount: validated.cookieCount },
        secretUpdate: {
            encryptedValue: encryptSecret(validated.normalized),
            maskedValue: `${validated.cookieCount} YouTube session cookies`,
        },
    });

    return { cookieCount: validated.cookieCount };
}

export async function verifySavedYouTubeAccess(
    userId: string,
    options: { adapterFactory?: (cookiesText: string) => YtDlpAdapter } = {},
) {
    const record = await findServiceConnectionByType(userId, "youtube");

    if (!record?.secret) {
        throw new YouTubeAccessError("Upload a YouTube cookies.txt file first.", "cookiesFile");
    }

    try {
        const cookiesText = decryptSecret(record.secret.encryptedValue);

        await verifyAdapter((options.adapterFactory ?? adapterForCookieText)(cookiesText));
        await updateServiceConnectionVerification(
            record.connection.id,
            "verified",
            "Authenticated YouTube extraction verified.",
            record.metadata,
        );
    } catch (error) {
        await updateServiceConnectionVerification(
            record.connection.id,
            "error",
            "The saved YouTube session is no longer accepted. Export and upload a fresh session.",
            record.metadata,
        );

        throw error;
    }
}

export async function disconnectYouTubeAccess(userId: string) {
    return deleteServiceConnection(userId, "youtube");
}
