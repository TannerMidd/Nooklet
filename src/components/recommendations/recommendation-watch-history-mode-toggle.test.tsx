// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(workspace)/recommendation-actions", () => ({
    submitRecommendationWatchHistoryModeAction: vi.fn(),
}));

import { submitRecommendationWatchHistoryModeAction } from "@/app/(workspace)/recommendation-actions";
import { RecommendationWatchHistoryModeToggle } from "./recommendation-watch-history-mode-toggle";

describe("RecommendationWatchHistoryModeToggle", () => {
    it("announces a failed save while retaining the current mode and a working retry", async () => {
        const action = vi.mocked(submitRecommendationWatchHistoryModeAction);

        action.mockResolvedValue({
            status: "error",
            message: "Watch-history mode could not be saved. Try again.",
        });
        render(<RecommendationWatchHistoryModeToggle enabled={false} redirectPath="/tv" />);
        const toggle = screen.getByRole("button", { name: "Enable watch-history-only mode" });

        fireEvent.click(toggle);
        expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
        expect(toggle).toHaveAttribute("aria-pressed", "false");
        expect(toggle).toBeEnabled();
        expect(action.mock.calls[0][0].get("watchHistoryOnly")).toBe("true");
        fireEvent.click(toggle);
        await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    });
});
