// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
    addIndexerAction: vi.fn(),
    removeIndexerAction: vi.fn(),
    testIndexerAction: vi.fn(),
    updateIndexerAction: vi.fn(),
}));

import type { IndexerSettingsView } from "@/modules/indexers/queries/list-indexer-settings";
import { IndexerSettingsForm } from "./indexer-settings-form";

const legacyIndexer: IndexerSettingsView = {
    id: "indexer-1",
    name: "Example indexer",
    protocol: "newznab",
    baseUrl: "https://example.test/",
    hasEmbeddedCredentials: true,
    apiPath: "/api",
    status: "error",
    statusMessage: "Indexer status is unavailable.",
    isEnabled: true,
    priority: 0,
    maskedApiKey: "••••1234",
    categories: [{ mediaType: "movie", categoryId: "2000", label: "Movies" }],
};

describe("IndexerSettingsForm", () => {
    it("requires a clean replacement instead of submitting a redacted legacy URL", () => {
        render(<IndexerSettingsForm indexer={legacyIndexer} />);

        const baseUrl = screen.getByPlaceholderText("https://indexer.example.com");
        const testAndSave = screen.getByRole("button", { name: "Test & save" });
        const save = screen.getByRole("button", { name: "Save without testing" });

        expect(baseUrl).toHaveValue("");
        expect(baseUrl).toBeRequired();
        expect(screen.getByText(/previous URL is hidden/i)).toBeInTheDocument();
        expect(testAndSave).toBeDisabled();
        expect(save).toBeDisabled();

        fireEvent.change(baseUrl, { target: { value: "https://clean.example.test" } });

        expect(testAndSave).toBeEnabled();
        expect(save).toBeEnabled();
    });
});
