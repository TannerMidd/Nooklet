"use client";

import { type ReactNode, useState } from "react";

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

    const tabs = [
        { key: "details", label: "Details" },
        { key: "content", label: contentLabel },
        { key: "settings", label: "Settings" },
    ] as const satisfies readonly { key: LibraryTitleDialogTabKey; label: string }[];

    return (
        <LibraryTitleDialogShell
            labelledBy={labelledBy}
            closeHref={closeHref}
            eyebrow={eyebrow}
            title={title}
            sub={sub}
            subBar={
                <div className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
                    {tabs.map((entry) => (
                        <DialogPill
                            key={entry.key}
                            active={tab === entry.key}
                            onClick={() => setTab(entry.key)}
                        >
                            {entry.label}
                        </DialogPill>
                    ))}
                </div>
            }
        >
            {tab === "details" ? details : null}
            {tab === "content" ? content : null}
            {tab === "settings" ? settings : null}
            {always}
        </LibraryTitleDialogShell>
    );
}
