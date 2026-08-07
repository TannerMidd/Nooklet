"use client";

import { Search } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { searchLibraryItemReleasesAction } from "@/app/(workspace)/library/actions";
import {
    initialLibraryItemSearchActionState,
    type LibraryItemSearchActionState,
} from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";
import { cn } from "@/lib/utils";

type LibraryItemSearchStatus = LibraryItemSearchActionState["status"];

type LibraryItemSearchFormProps = {
    titleId: string;
    seasonId?: string;
    episodeId?: string;
    label: string;
    targetPathOptions: MediaLibraryPathOption[];
    currentLibraryPathId?: string | null;
    /**
     * Row-level variant used by the episode table: an icon-only trigger that
     * inherits the destination folder chosen once for the whole title, instead
     * of repeating a folder select on every row.
     */
    compact?: boolean;
};

function pathOptionLabel(option: MediaLibraryPathOption) {
    return `${option.label} - ${option.path}${option.isDownloadDefault ? " (default)" : ""}`;
}

function SearchButton({ label }: { label: string }) {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            <Search aria-hidden="true" size={14} />
            {pending ? "Searching..." : label}
        </Button>
    );
}

const compactStatusTone: Record<LibraryItemSearchStatus, string> = {
    idle: "text-muted/70",
    success: "text-accent-cool",
    warning: "text-accent",
    error: "text-accent-wine",
};

function CompactSearchButton({
    label,
    status,
    outcome,
}: {
    label: string;
    status: LibraryItemSearchStatus;
    outcome: string | null;
}) {
    const { pending } = useFormStatus();
    // The outcome belongs in the accessible name too: the icon alone cannot say
    // what happened, and this button used to be the only place the result went.
    const accessibleLabel = outcome ? `${label}. ${outcome}` : label;

    return (
        <button
            type="submit"
            disabled={pending}
            aria-label={accessibleLabel}
            title={accessibleLabel}
            className={cn(
                "inline-flex h-11 w-11 items-center justify-center rounded-lg border-none bg-transparent transition hover:bg-cream/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60",
                pending ? "text-muted/70" : compactStatusTone[status],
            )}
        >
            <Search aria-hidden="true" size={13} className={cn(pending && "animate-pulse")} />
        </button>
    );
}

/**
 * Transient, visible result for the icon-only trigger.
 *
 * Compact mode previously passed the outcome to `aria-label`/`title` only, so
 * a search that found nothing — or failed outright — produced no visible
 * change at all and read as a dead button. It is positioned to the left of the
 * trigger so it stays inside the row's scroll container.
 */
function CompactSearchOutcome({
    message,
    status,
}: {
    message: string;
    status: LibraryItemSearchStatus;
}) {
    // Remounted per submission by its key, so the timer restarts on every
    // search — including one that returns the identical result twice in a row.
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => setVisible(false), 9_000);

        return () => clearTimeout(timer);
    }, []);

    if (!visible) {
        return null;
    }

    return (
        <span
            role="status"
            onClick={() => setVisible(false)}
            className={cn(
                "nk-rise absolute right-full top-1/2 z-20 mr-1.5 w-max max-w-[min(24rem,55vw)] -translate-y-1/2 cursor-default rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] leading-snug shadow-[0_18px_36px_-16px_rgba(0,0,0,0.95)]",
                status === "error"
                    ? "border-accent-wine/45 bg-accent-wine/[0.14] text-foreground"
                    : status === "warning"
                      ? "border-accent/45 bg-accent/[0.13] text-foreground"
                      : "border-accent-cool/45 bg-accent-cool/[0.13] text-foreground",
            )}
        >
            {message}
        </span>
    );
}

export function LibraryItemSearchForm({
    titleId,
    seasonId,
    episodeId,
    label,
    targetPathOptions,
    currentLibraryPathId,
    compact = false,
}: LibraryItemSearchFormProps) {
    const [state, formAction] = useActionState(
        searchLibraryItemReleasesAction,
        initialLibraryItemSearchActionState,
    );
    // Identifies each submission so the compact outcome can remount and re-show.
    const [runId, setRunId] = useState(0);
    const defaultPathId =
        currentLibraryPathId &&
        targetPathOptions.some((option) => option.id === currentLibraryPathId)
            ? currentLibraryPathId
            : ((
                  targetPathOptions.find((option) => option.isDownloadDefault) ??
                  targetPathOptions[0]
              )?.id ?? "");

    if (compact) {
        return (
            <form
                action={(formData) => {
                    setRunId((current) => current + 1);

                    return formAction(formData);
                }}
                className="contents"
            >
                <input type="hidden" name="titleId" value={titleId} />
                {seasonId ? <input type="hidden" name="seasonId" value={seasonId} /> : null}
                {episodeId ? <input type="hidden" name="episodeId" value={episodeId} /> : null}
                <input type="hidden" name="targetLibraryPathId" value={defaultPathId} />
                {/* The wrapper is the grid cell, so the popover can anchor to the
            trigger without knocking the row's columns out of alignment. */}
                <span className="relative inline-flex items-center justify-center">
                    {state.message ? (
                        <CompactSearchOutcome
                            key={runId}
                            message={state.message}
                            status={state.status}
                        />
                    ) : null}
                    <CompactSearchButton
                        label={label}
                        status={state.status}
                        outcome={state.message}
                    />
                </span>
            </form>
        );
    }

    return (
        <form action={formAction} className="flex flex-col gap-2">
            <input type="hidden" name="titleId" value={titleId} />
            {seasonId ? <input type="hidden" name="seasonId" value={seasonId} /> : null}
            {episodeId ? <input type="hidden" name="episodeId" value={episodeId} /> : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1 space-y-1 text-sm sm:min-w-56">
                    <span className="font-medium text-foreground">Destination folder</span>
                    <select
                        name="targetLibraryPathId"
                        defaultValue={defaultPathId}
                        disabled={targetPathOptions.length === 0}
                        className="min-h-11 w-full rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-3 py-1.5 text-xs text-foreground outline-none transition focus:border-accent/55 focus:bg-cream/[0.04] focus:ring-1 focus:ring-accent/25 disabled:opacity-60"
                    >
                        {targetPathOptions.length === 0 ? (
                            <option value="">No active folders</option>
                        ) : (
                            targetPathOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {pathOptionLabel(option)}
                                </option>
                            ))
                        )}
                    </select>
                </label>
                <SearchButton label={label} />
            </div>
            {state.message ? (
                <InlineAlert
                    variant={
                        state.status === "error"
                            ? "error"
                            : state.status === "warning"
                              ? "warning"
                              : "success"
                    }
                    className="py-1.5 text-xs"
                >
                    {state.message}
                </InlineAlert>
            ) : null}
        </form>
    );
}
