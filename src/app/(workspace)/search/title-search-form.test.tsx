// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(workspace)/search/actions", () => ({ requestSearchTitleAction: vi.fn() }));
vi.mock("@/app/(workspace)/search/queue-result-button", () => ({ QueueResultButton: () => null }));
vi.mock("@/components/media-library/title-request-controls", () => ({
    TitleRequestControls: () => null,
}));

import { TitleSearchForm } from "./title-search-form";

afterEach(cleanup);

describe("title search states", () => {
    const props = {
        initialQuery: "Arrival",
        initialMediaType: "movie" as const,
        libraries: [],
        qualityProfiles: [],
        pathOptions: [],
    };

    it("shows a setup recovery action without claiming an unsuccessful search had no matches", () => {
        render(
            <TitleSearchForm
                {...props}
                initialState={{
                    status: "error",
                    reason: "tmdb-not-configured",
                    message: "Verify a TMDB connection.",
                    results: [],
                }}
            />,
        );
        expect(screen.getByRole("alert")).toHaveTextContent("Verify a TMDB connection.");
        expect(screen.queryByText("No title matches found.")).not.toBeInTheDocument();
        expect(screen.getByRole("textbox")).toHaveValue("Arrival");
        const href = screen.getByRole("link", { name: "Configure metadata" }).getAttribute("href")!;
        const url = new URL(href, "http://nooklet.test");

        expect(url.searchParams.get("configure")).toBe("tmdb");
        expect(url.searchParams.get("returnTo")).toBe("/search?type=movie&q=Arrival");
    });

    it("offers retry for a failed request while retaining the query", () => {
        render(
            <TitleSearchForm
                {...props}
                initialState={{
                    status: "error",
                    reason: "tmdb-error",
                    message: "Try again.",
                    results: [],
                }}
            />,
        );
        expect(screen.getByRole("button", { name: "Try search again" })).toHaveAttribute(
            "type",
            "submit",
        );
        expect(screen.getByRole("textbox")).toHaveValue("Arrival");
        expect(screen.queryByText("No title matches found.")).not.toBeInTheDocument();
    });

    it("reserves the no-matches state for a successful empty response", () => {
        render(
            <TitleSearchForm
                {...props}
                initialState={{ status: "success", message: "0 titles found.", results: [] }}
            />,
        );
        expect(screen.getByText("No title matches found.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Try search again" })).not.toBeInTheDocument();
    });
});
