"use client";

import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";

import { DialogPill } from "@/components/ui/dialog-shell";
import { LibraryTitleDialogShell } from "@/app/(workspace)/library/library-title-dialog-shell";

type LibraryTitleDialogTabKey = "details" | "content" | "settings";

type LibraryTitleDialogTabsProps = {
    labelledBy: string;
    closeHref: string;
    eyebrow: string;
    title: string;
    sub: string;
    /** Label of the middle pill: "Files" for movies, "Episodes" for TV. */
    contentLabel: string;
    /** Rendered on every tab; keep invisible side effects here. */
    always?: ReactNode;
    details: ReactNode;
    content: ReactNode;
    settings: ReactNode;
};

/**
 * Owns the tab state of the library title dialog. Server-rendered sections
 * arrive as slot props so they stay server components; switching tabs
 * swaps which slot is shown inside the shell's single scroll region.
 */
export function LibraryTitleDialogTabs({
    labelledBy,
    closeHref,
    eyebrow,
    title,
    sub,
    contentLabel,
    always,
    details,
    content,
    settings,
}: LibraryTitleDialogTabsProps) {
    const [tab, setTab] = useState<LibraryTitleDialogTabKey>("details");
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const tabs = [
        { key: "details", label: "Details" },
        { key: "content", label: contentLabel },
        { key: "settings", label: "Settings" },
    ] as const satisfies readonly { key: LibraryTitleDialogTabKey; label: string }[];

    function handleTabKeyDown(index: number, event: KeyboardEvent<HTMLButtonElement>) {
        let nextIndex: number | null = null;

        if (event.key === "ArrowRight") {
            nextIndex = (index + 1) % tabs.length;
        } else if (event.key === "ArrowLeft") {
            nextIndex = (index - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
            nextIndex = 0;
        } else if (event.key === "End") {
            nextIndex = tabs.length - 1;
        }

        if (nextIndex === null) {
            return;
        }

        event.preventDefault();
        setTab(tabs[nextIndex].key);
        tabRefs.current[nextIndex]?.focus();
    }

    const tabListId = `${labelledBy}-tablist`;
    const tabContent: Record<LibraryTitleDialogTabKey, ReactNode> = {
        details,
        content,
        settings,
    };

    return (
        <LibraryTitleDialogShell
            labelledBy={labelledBy}
            closeHref={closeHref}
            eyebrow={eyebrow}
            title={title}
            sub={sub}
            subBar={
                <div
                    id={tabListId}
                    className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6"
                    role="tablist"
                    aria-label={`${title} sections`}
                    aria-orientation="horizontal"
                >
                    {tabs.map((entry, index) => (
                        <DialogPill
                            key={entry.key}
                            ref={(element) => {
                                tabRefs.current[index] = element;
                            }}
                            id={`${labelledBy}-${entry.key}-tab`}
                            role="tab"
                            ariaControls={`${labelledBy}-${entry.key}-panel`}
                            ariaSelected={tab === entry.key}
                            tabIndex={tab === entry.key ? 0 : -1}
                            active={tab === entry.key}
                            onClick={() => setTab(entry.key)}
                            onKeyDown={(event) => handleTabKeyDown(index, event)}
                        >
                            {entry.label}
                        </DialogPill>
                    ))}
                </div>
            }
        >
            {tabs.map((entry) => (
                <div
                    key={entry.key}
                    id={`${labelledBy}-${entry.key}-panel`}
                    role="tabpanel"
                    aria-labelledby={`${labelledBy}-${entry.key}-tab`}
                    tabIndex={tab === entry.key ? 0 : -1}
                    hidden={tab !== entry.key}
                >
                    {tab === entry.key ? tabContent[entry.key] : null}
                </div>
            ))}
            {always}
        </LibraryTitleDialogShell>
    );
}
