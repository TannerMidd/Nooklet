// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./youtube-access-actions", () => ({ submitYouTubeAccessAction: vi.fn() }));

import { YouTubeAccessCard } from "./youtube-access-card";

describe("YouTubeAccessCard", () => {
    it("shows explicit export guidance, verification, and replacement controls", () => {
        render(
            <YouTubeAccessCard
                canManage
                summary={{
                    serviceType: "youtube",
                    displayName: "YouTube access",
                    description: "Authenticated extraction",
                    baseUrl: "https://www.youtube.com",
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

        expect(screen.getByText("Create a durable session export")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "YouTube robots.txt" })).toHaveAttribute(
            "href",
            "https://www.youtube.com/robots.txt",
        );
        expect(screen.getByText("12 YouTube session cookies")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Test & save session" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Verify saved" })).toBeInTheDocument();
    });
});
