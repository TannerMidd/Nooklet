// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ submitConnectionAction: vi.fn() }));

import type { ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";
import { ConnectionCard } from "./connection-card";
import { submitConnectionAction } from "./actions";

const summary: ServiceConnectionSummary = {
    serviceType: "tmdb",
    displayName: "TMDB",
    description: "Title metadata",
    baseUrl: "https://api.themoviedb.org/3",
    hasEmbeddedCredentials: false,
    status: "configured",
    statusMessage: "Saved configuration.",
    maskedSecret: "••••1234",
    model: null,
    availableModels: [],
    serverName: null,
    availableUsers: [],
    lastVerifiedAt: null,
};

afterEach(cleanup);

describe("ConnectionCard", () => {
    it("shows a failed retest even when the editor was collapsed", async () => {
        vi.mocked(submitConnectionAction).mockResolvedValueOnce({
            status: "error",
            message: "The provider could not be reached. Try again.",
        });
        render(<ConnectionCard summary={summary} requirement="Metadata" />);
        expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Test again" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("provider could not be reached");
        expect(screen.getByRole("button", { name: "Test again" })).toBeEnabled();
    });

    it("opens retest field errors and associates the closed model select with its explanation", async () => {
        vi.mocked(submitConnectionAction).mockResolvedValueOnce({
            status: "error",
            message: "Review the model setting.",
            fieldErrors: { model: "Choose an available model." },
        });
        render(
            <ConnectionCard
                summary={{ ...summary, serviceType: "ai-provider", displayName: "AI provider" }}
                requirement="Recommendations"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Test again" }));
        await waitFor(() => {
            const model = screen.getByRole("button", { name: "Default model" });
            const error = screen.getByText("Choose an available model.");

            expect(model).toHaveAttribute("aria-invalid", "true");
            expect(model).toHaveAttribute("aria-describedby", error.id);
            expect(model).toHaveAttribute("aria-errormessage", error.id);
            expect(error).toBeVisible();
        });
    });

    it("opens a setup-linked editor and keeps saved versus verified status explicit", () => {
        render(<ConnectionCard summary={summary} requirement="Metadata" initiallyExpanded />);
        expect(screen.getByLabelText("Base URL")).toHaveValue(summary.baseUrl);
        expect(screen.getByText("Saved · not verified")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Close TMDB configuration" }));
        expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Configure" })).toBeInTheDocument();
    });

    it("requires clean replacement of a legacy credential-bearing address", () => {
        render(
            <ConnectionCard
                summary={{
                    ...summary,
                    baseUrl: "https://api.example.test",
                    hasEmbeddedCredentials: true,
                }}
                requirement="Metadata"
            />,
        );
        expect(screen.getByRole("alert")).toHaveTextContent("needs repair");
        expect(screen.getByLabelText("Base URL")).toHaveValue("");
        expect(screen.getByLabelText("Base URL")).toBeRequired();
    });

    it("requires a clean Usenet host rather than resubmitting a redacted address", () => {
        render(
            <ConnectionCard
                summary={{
                    ...summary,
                    serviceType: "usenet-server",
                    baseUrl: "nntps://news.example.test:563?connections=4",
                    hasEmbeddedCredentials: true,
                }}
                requirement="Downloads"
            />,
        );
        expect(screen.getByLabelText("Server host")).toHaveValue("");
        expect(screen.getByLabelText("Server host")).toBeRequired();
    });
});
