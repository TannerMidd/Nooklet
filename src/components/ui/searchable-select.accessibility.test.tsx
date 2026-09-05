// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SearchableSelect } from "./searchable-select";

describe("SearchableSelect accessibility", () => {
    it("exposes invalid state and its error description on the closed trigger", () => {
        render(
            <>
                <SearchableSelect
                    name="aiModel"
                    id="ai-model"
                    options={["Model A"]}
                    ariaLabel="AI model"
                    ariaInvalid
                    ariaDescribedBy="ai-model-help ai-model-error"
                    ariaErrormessage="ai-model-error"
                />
                <p id="ai-model-help">Choose a model.</p>
                <p id="ai-model-error">Choose an available model.</p>
            </>,
        );

        const trigger = screen.getByRole("button", { name: "AI model" });

        expect(trigger).toHaveAttribute("id", "ai-model");
        expect(trigger).toHaveAttribute("aria-invalid", "true");
        expect(trigger).toHaveAttribute("aria-describedby", "ai-model-help ai-model-error");
        expect(trigger).toHaveAttribute("aria-errormessage", "ai-model-error");

        fireEvent.click(trigger);

        const searchInput = screen.getByRole("combobox", { name: "Search AI model" });

        expect(searchInput).toHaveAttribute("aria-invalid", "true");
        expect(searchInput).toHaveAttribute("aria-describedby", "ai-model-help ai-model-error");
        expect(searchInput).toHaveAttribute("aria-errormessage", "ai-model-error");
    });
});
