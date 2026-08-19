import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(workspace)/library/youtube/actions", () => ({
    cancelYouTubeDownloadAction: vi.fn(),
    configureYouTubeRequestAction: vi.fn(),
    removeYouTubeSourceAction: vi.fn(),
    retryAllYouTubeDownloadsAction: vi.fn(),
    retryYouTubeDownloadAction: vi.fn(),
    retryYouTubeSourceInitializationAction: vi.fn(),
    runYouTubeSourceSyncAction: vi.fn(),
    setYouTubeSourcePausedAction: vi.fn(),
    updateYouTubeSourceAction: vi.fn(),
}));

import type { YouTubeDownloadActivityDTO } from "@/modules/youtube/public";

import { YouTubeActivityContributionPanel } from "./activity-contribution-panel";
import { YouTubeSearchContent } from "./library-content";

const channelSource = {
    kind: "channel_videos" as const,
    youtubeSourceId: "@nooklet",
    canonicalUrl: "https://www.youtube.com/@nooklet/videos",
    title: "Nooklet",
    channelId: "UC1234567890123456789012",
    channelTitle: "Nooklet",
    thumbnailUrl: null,
};

const options = { destinations: [], qualityProfiles: [] };

describe("YouTube channel discovery content", () => {
    it("renders the regular Videos configurator context and exact public-playlist links", () => {
        const markup = renderToStaticMarkup(
            <YouTubeSearchContent
                options={options}
                state={{
                    kind: "source",
                    enumeration: { complete: true, source: channelSource, videos: [] },
                    publicPlaylists: [
                        {
                            kind: "playlist",
                            youtubeSourceId: "PL1234567890abc",
                            canonicalUrl: "https://www.youtube.com/playlist?list=PL1234567890abc",
                            title: "Release notes",
                            channelId: channelSource.channelId,
                            channelTitle: channelSource.channelTitle,
                            thumbnailUrl: null,
                        },
                    ],
                    playlistDiscoveryError: null,
                }}
            />,
        );

        expect(markup).toContain("Regular Videos feed");
        expect(markup).toContain("Public playlists");
        expect(markup).toContain("Release notes");
        expect(markup).toContain("/settings/storage?mediaType=youtube");
        expect(markup).toContain(
            "/library/youtube?view=search&amp;q=https%3A%2F%2Fwww.youtube.com%2Fplaylist%3Flist%3DPL1234567890abc",
        );
    });

    it("does not render a configuration submission for incomplete channel listings", () => {
        const markup = renderToStaticMarkup(
            <YouTubeSearchContent
                options={{
                    destinations: [
                        {
                            id: "youtube-root",
                            label: "YouTube",
                            path: "F:/YouTube",
                            isDefault: true,
                        },
                    ],
                    qualityProfiles: [{ value: "mp4-1080p", label: "MP4 up to 1080p" }],
                }}
                state={{
                    kind: "source",
                    enumeration: { complete: false, source: channelSource, videos: [] },
                    publicPlaylists: [],
                    playlistDiscoveryError: null,
                }}
            />,
        );

        expect(markup).toContain("partial listing");
        expect(markup).not.toContain("Save selection");
    });
});

describe("YouTube Activity content", () => {
    it("labels queued work without presenting zero bytes as transfer progress", () => {
        const entry = {
            kind: "youtube",
            id: "download-queued",
            userId: "user-1",
            videoId: "video-queued",
            youtubeVideoId: "dQw4w9WgXcQ",
            sourceId: null,
            sourceTitle: null,
            title: "Queued video",
            channelTitle: "Nooklet",
            thumbnailUrl: null,
            libraryPathId: "path-1",
            destinationLabel: "YouTube",
            destinationPath: "F:/YouTube",
            qualityProfile: "mp4-1080p",
            status: "queued",
            progressPercent: 0,
            downloadedBytes: 0,
            totalBytes: null,
            bytesPerSecond: null,
            etaSeconds: null,
            attemptCount: 0,
            nextAttemptAt: null,
            failureKind: null,
            errorMessage: null,
            finalPath: null,
            createdAt: new Date("2026-08-19T11:00:00.000Z"),
            updatedAt: new Date("2026-08-19T11:00:00.000Z"),
            completedAt: null,
        } satisfies YouTubeDownloadActivityDTO;
        const markup = renderToStaticMarkup(<YouTubeActivityContributionPanel entries={[entry]} />);

        expect(markup).toContain("Waiting for downloader");
        expect(markup).not.toContain("0 B");
        expect(markup).not.toContain("Download progress for Queued video");
    });

    it("renders persisted transfer bytes, total, speed, and percentage", () => {
        const entry = {
            kind: "youtube",
            id: "download-progress",
            userId: "user-1",
            videoId: "video-progress",
            youtubeVideoId: "dQw4w9WgXcQ",
            sourceId: null,
            sourceTitle: null,
            title: "Downloading video",
            channelTitle: "Nooklet",
            thumbnailUrl: null,
            libraryPathId: "path-1",
            destinationLabel: "YouTube",
            destinationPath: "F:/YouTube",
            qualityProfile: "mp4-1080p",
            status: "downloading",
            progressPercent: 50,
            downloadedBytes: 1_048_576,
            totalBytes: 2_097_152,
            bytesPerSecond: 65_536,
            etaSeconds: 16,
            attemptCount: 1,
            nextAttemptAt: null,
            failureKind: null,
            errorMessage: null,
            finalPath: null,
            createdAt: new Date("2026-08-19T11:00:00.000Z"),
            updatedAt: new Date("2026-08-19T11:01:00.000Z"),
            completedAt: null,
        } satisfies YouTubeDownloadActivityDTO;
        const markup = renderToStaticMarkup(<YouTubeActivityContributionPanel entries={[entry]} />);

        expect(markup).toContain("50%");
        expect(markup).toContain("1.0 MB of 2.0 MB");
        expect(markup).toContain("64 KB/s");
        expect(markup).toContain('value="50"');
    });

    it("shows a controlled capacity wait reason", () => {
        const entry = {
            kind: "youtube",
            id: "download-1",
            userId: "user-1",
            videoId: "video-1",
            youtubeVideoId: "dQw4w9WgXcQ",
            sourceId: null,
            sourceTitle: null,
            title: "Waiting video",
            channelTitle: "Nooklet",
            thumbnailUrl: null,
            libraryPathId: "path-1",
            destinationLabel: "YouTube",
            destinationPath: "F:/YouTube",
            qualityProfile: "mp4-1080p",
            status: "retry_wait",
            progressPercent: 0,
            downloadedBytes: 0,
            totalBytes: null,
            bytesPerSecond: null,
            etaSeconds: null,
            attemptCount: 0,
            nextAttemptAt: new Date("2026-08-19T12:00:00.000Z"),
            failureKind: "infrastructure",
            errorMessage: "Waiting for enough free space to start this YouTube download.",
            finalPath: null,
            createdAt: new Date("2026-08-19T11:00:00.000Z"),
            updatedAt: new Date("2026-08-19T11:00:00.000Z"),
            completedAt: null,
        } satisfies YouTubeDownloadActivityDTO;
        const markup = renderToStaticMarkup(<YouTubeActivityContributionPanel entries={[entry]} />);

        expect(markup).toContain(entry.errorMessage);
        expect(markup).toContain("Run all now");
        expect(markup).toContain("Requeue every failed, cancelled, or waiting download");
    });

    it("shows the controlled YouTube challenge reason and the full-batch control", () => {
        const entry = {
            kind: "youtube",
            id: "download-2",
            userId: "user-1",
            videoId: "video-2",
            youtubeVideoId: "aqz-KE-bpKQ",
            sourceId: null,
            sourceTitle: null,
            title: "YouTube challenge",
            channelTitle: "Nooklet",
            thumbnailUrl: null,
            libraryPathId: "path-1",
            destinationLabel: "YouTube",
            destinationPath: "F:/YouTube",
            qualityProfile: "mp4-1080p",
            status: "retry_wait",
            progressPercent: 0,
            downloadedBytes: 0,
            totalBytes: null,
            bytesPerSecond: null,
            etaSeconds: null,
            attemptCount: 1,
            nextAttemptAt: new Date("2026-08-19T12:00:00.000Z"),
            failureKind: "retryable",
            errorMessage:
                "YouTube requires a signed-in session for this server. An administrator must verify YouTube access in Settings → Connections.",
            finalPath: null,
            createdAt: new Date("2026-08-19T11:00:00.000Z"),
            updatedAt: new Date("2026-08-19T11:00:00.000Z"),
            completedAt: null,
        } satisfies YouTubeDownloadActivityDTO;
        const markup = renderToStaticMarkup(<YouTubeActivityContributionPanel entries={[entry]} />);

        expect(markup).toContain(entry.errorMessage);
        expect(markup).toContain("Run all now");
        expect(markup).toContain("/settings/connections");
        expect(markup).toContain("Configure access");
    });
});
