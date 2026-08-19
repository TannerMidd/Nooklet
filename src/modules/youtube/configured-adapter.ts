import "server-only";

import { createYtDlpAdapter, type YtDlpProcessExecutor } from "@/modules/youtube/adapters/yt-dlp";
import { createConfiguredYouTubeCookieLease } from "@/modules/youtube/runtime/cookie-lease";

export function createConfiguredYtDlpAdapter(
    input: {
        executor?: YtDlpProcessExecutor;
        ytDlpPath?: string;
        ffmpegPath?: string;
        discoveryDeadlineMs?: number;
        inactivityDeadlineMs?: number;
    } = {},
) {
    return createYtDlpAdapter({
        ...input,
        cookieLeaseProvider: createConfiguredYouTubeCookieLease,
    });
}
