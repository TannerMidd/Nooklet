// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
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

import { YouTubeBulkRetryForm, YouTubeDownloadConfigurationForm } from "./action-forms";

describe("YouTubeDownloadConfigurationForm", () => {
    it("selects every eligible playlist video by default and supports bulk controls", () => {
        const { container } = render(
            <YouTubeDownloadConfigurationForm
                targetKind="source"
                targetUrl="https://www.youtube.com/playlist?list=PL1234567890abc"
                videos={[
                    {
                        youtubeVideoId: "dQw4w9WgXcQ",
                        title: "First video",
                        channelTitle: "Nooklet",
                        publishedAt: null,
                        eligible: true,
                    },
                    {
                        youtubeVideoId: "aqz-KE-bpKQ",
                        title: "Second video",
                        channelTitle: "Nooklet",
                        publishedAt: null,
                        eligible: true,
                    },
                    {
                        youtubeVideoId: "unavailabl1",
                        title: "Unavailable video",
                        channelTitle: "Nooklet",
                        publishedAt: null,
                        eligible: false,
                    },
                ]}
                options={{
                    destinations: [{ id: "youtube-root", label: "YouTube", isDefault: true }],
                    qualityProfiles: [{ value: "mp4-1080p", label: "MP4 up to 1080p" }],
                }}
            />,
        );
        const videoCheckboxes = [
            ...container.querySelectorAll<HTMLInputElement>('input[name="videoIds"]'),
        ];

        expect(videoCheckboxes).toHaveLength(2);
        expect(videoCheckboxes.every((checkbox) => checkbox.checked)).toBe(true);
        expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
        expect(videoCheckboxes.every((checkbox) => !checkbox.checked)).toBe(true);
        expect(screen.getByText("0 of 2 selected")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Select all" }));
        expect(videoCheckboxes.every((checkbox) => checkbox.checked)).toBe(true);
        expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
    });
});

describe("YouTubeBulkRetryForm", () => {
    it("renders one explicit account-wide run control", () => {
        render(<YouTubeBulkRetryForm />);

        expect(screen.getByRole("button", { name: "Run all now" })).toBeInTheDocument();
    });
});
