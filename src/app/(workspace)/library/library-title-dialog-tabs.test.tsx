// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(workspace)/library/library-title-dialog-shell", () => ({
    LibraryTitleDialogShell: ({ subBar, children }: { subBar: ReactNode; children: ReactNode }) => (
        <div>
            {subBar}
            {children}
        </div>
    ),
}));

import { LibraryTitleDialogTabs } from "./library-title-dialog-tabs";

describe("LibraryTitleDialogTabs", () => {
    it("uses tab semantics and moves focus with the tab-list keys", () => {
        render(
            <LibraryTitleDialogTabs
                labelledBy="title-dialog"
                closeHref="/library"
                eyebrow="TV"
                title="Arrival"
                sub="2016"
                contentLabel="Episodes"
                details={<p>Details content</p>}
                content={<p>Episodes content</p>}
                settings={<p>Settings content</p>}
            />,
        );

        const tabList = screen.getByRole("tablist", { name: "Arrival sections" });
        const tabs = screen.getAllByRole("tab");
        const detailsTab = screen.getByRole("tab", { name: "Details" });
        const contentTab = screen.getByRole("tab", { name: "Episodes" });
        const panels = screen.getAllByRole("tabpanel", { hidden: true });
        const panel = screen.getByRole("tabpanel", { name: "Details" });

        expect(tabList).toBeInTheDocument();
        expect(tabs).toHaveLength(3);
        expect(panels).toHaveLength(3);
        tabs.forEach((tabButton) => {
            const panelId = tabButton.getAttribute("aria-controls");

            expect(panelId).toBeTruthy();
            expect(document.getElementById(panelId!)).toBeInTheDocument();
        });
        expect(detailsTab).toHaveAttribute("aria-selected", "true");
        expect(detailsTab).toHaveAttribute("aria-controls", panel.id);
        expect(detailsTab).toHaveAttribute("tabindex", "0");
        expect(contentTab).toHaveAttribute("tabindex", "-1");
        expect(document.getElementById("title-dialog-content-panel")).toHaveAttribute("hidden");
        expect(panel).toHaveTextContent("Details content");

        fireEvent.keyDown(detailsTab, { key: "ArrowRight" });

        expect(contentTab).toHaveFocus();
        expect(contentTab).toHaveAttribute("aria-selected", "true");
        const episodesPanel = screen.getByRole("tabpanel", { name: "Episodes" });

        expect(episodesPanel).toHaveTextContent("Episodes content");
        expect(episodesPanel).not.toHaveAttribute("hidden");
        expect(document.getElementById("title-dialog-details-panel")).toHaveAttribute("hidden");

        fireEvent.keyDown(contentTab, { key: "End" });

        const settingsTab = screen.getByRole("tab", { name: "Settings" });

        expect(settingsTab).toHaveFocus();
        expect(settingsTab).toHaveAttribute("aria-selected", "true");
        const settingsPanel = screen.getByRole("tabpanel", { name: "Settings" });

        expect(settingsPanel).toHaveTextContent("Settings content");
        expect(settingsPanel).not.toHaveAttribute("hidden");
        expect(document.getElementById("title-dialog-content-panel")).toHaveAttribute("hidden");
    });
});
