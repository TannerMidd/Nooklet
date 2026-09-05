// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./youtube-access-actions", () => ({ submitYouTubeAccessAction: vi.fn() }));

import { YouTubeAccessCard } from "./youtube-access-card";
import { submitYouTubeAccessAction } from "./youtube-access-actions";

describe("YouTubeAccessCard", () => {
    it("retains expanded guidance across failed actions and associates the file error", async () => {
        vi.mocked(submitYouTubeAccessAction).mockResolvedValueOnce({
            status: "error",
            message: "Review the session export.",
            fieldErrors: { cookiesFile: "Choose a valid cookies.txt export." },
        });
        render(
            <YouTubeAccessCard
                canManage
                summary={{
                    serviceType: "youtube",
                    displayName: "YouTube access",
                    description: "Authenticated extraction",
                    baseUrl: "https://www.youtube.com",
                    hasEmbeddedCredentials: false,
                    status: "verified",
                    statusMessage: "Authenticated YouTube extraction verified.",
                    maskedSecret: "12 YouTube session cookies",
                    model: null,
                    availableModels: [],
                    serverName: null,
                    availableUsers: [],
                    lastVerifiedAt: new Date("2026-08-19T12:00:00.000Z"),
                }}
            />,
        );

        const guidance = screen.getByText("How to create a YouTube session export");

        expect(guidance.closest("details")).not.toHaveAttribute("open");
        fireEvent.click(guidance);
        fireEvent(guidance.closest("details")!, new Event("toggle"));
        expect(guidance.closest("details")).toHaveAttribute("open");
        expect(screen.getByRole("link", { name: "YouTube robots.txt" })).toHaveAttribute(
            "href",
            "https://www.youtube.com/robots.txt",
        );
        expect(screen.getByText("12 YouTube session cookies")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Test & save session" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Verify saved" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Test & save session" }));
        const error = await screen.findByText("Choose a valid cookies.txt export.");
        const input = screen.getByLabelText("YouTube cookies.txt", { selector: "input" });

        expect(input).toHaveAttribute("aria-describedby", error.id);
        expect(input).toHaveAttribute("aria-errormessage", error.id);
        expect(input).toHaveAttribute("aria-invalid", "true");
        await waitFor(() => expect(guidance.closest("details")).toHaveAttribute("open"));
    });
});
