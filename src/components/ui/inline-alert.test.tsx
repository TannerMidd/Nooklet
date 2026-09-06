// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InlineAlert } from "./inline-alert";

describe("InlineAlert", () => {
    it("accepts a partial-results message and recovery control without invalid nesting", () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

        try {
            render(
                <InlineAlert variant="warning">
                    <div>
                        <p>One section could not be loaded.</p>
                        <button type="button">Refresh</button>
                    </div>
                </InlineAlert>,
            );
            expect(screen.getByRole("status")).toContainElement(
                screen.getByRole("button", { name: "Refresh" }),
            );
            expect(screen.getByText("One section could not be loaded.")).toBeVisible();
            expect(consoleError).not.toHaveBeenCalled();
        } finally {
            consoleError.mockRestore();
        }
    });
});
