"use client";

import { Check, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
    loadTvSeasonEpisodesForLibraryAction,
    updateTvEpisodeMonitoringAction,
    updateTvSeasonMonitoringAction,
} from "@/app/(workspace)/library/actions";
import {
    initialTvEpisodeMonitoringActionState,
    initialTvSeasonMonitoringActionState,
} from "@/app/(workspace)/library/action-state";
import { LibraryItemSearchForm } from "@/app/(workspace)/library/library-item-search-form";
import { Button } from "@/components/ui/button";
import { type MediaLibraryTvEpisodeSummary } from "@/modules/media-library/queries/get-media-library-tv-title-details";
import { type MediaLibraryTvSeasonOverview } from "@/modules/media-library/queries/get-media-library-tv-title-summary";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";
import {
    episodeAvailability,
    parseCalendarDate,
    toCalendarDate,
} from "@/modules/media-library/episode-air-date";
import { cn } from "@/lib/utils";

/** Column track shared by the header and every row so they stay aligned. */
const rowGrid =
    "grid grid-cols-[24px_52px_minmax(0,1fr)_44px] items-center gap-2 px-3 sm:grid-cols-[24px_62px_minmax(0,1fr)_88px_58px_58px_44px] sm:gap-[11px] sm:px-5";

type EpisodeFetchState =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "loaded"; episodes: MediaLibraryTvEpisodeSummary[] };

function episodeCode(episode: MediaLibraryTvEpisodeSummary) {
    return `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
}

function hasNoFile(episode: MediaLibraryTvEpisodeSummary) {
    return !episode.hasFile && episode.fileCount === 0;
}

function isMissing(episode: MediaLibraryTvEpisodeSummary, today: string) {
    return hasNoFile(episode) && episodeAvailability(episode.airDate, today) === "aired";
}

/**
 * An episode that has not aired yet is not missing — there is nothing to have.
 * Labelling it "Missing" sent people hunting for a release that cannot exist,
 * which is exactly how a search returning nothing looks like a broken button.
 */
function qualityLabel(episode: MediaLibraryTvEpisodeSummary, today: string) {
    if (hasNoFile(episode)) {
        const availability = episodeAvailability(episode.airDate, today);

        if (availability === "aired") {
            return "Missing";
        }

        if (availability === "upcoming") {
            return "No file · unaired";
        }

        return "No file · date unknown";
    }

    return episode.qualityLabels.length > 0 ? episode.qualityLabels.join(" / ") : "Untagged";
}

function airDateLabel(episode: MediaLibraryTvEpisodeSummary) {
    const parsed = parseCalendarDate(episode.airDate);

    return parsed ? parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
}

function airDateTooltip(episode: MediaLibraryTvEpisodeSummary, today: string) {
    const parsed = parseCalendarDate(episode.airDate);

    if (!parsed) {
        return "No air date is known for this episode.";
    }

    const formatted = parsed.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    return episodeAvailability(episode.airDate, today) === "upcoming"
        ? `Airs ${formatted} — nothing has been posted yet`
        : `Aired ${formatted}`;
}

export function TvEpisodeTable({
    titleId,
    seasons,
    targetPathOptions,
    currentLibraryPathId,
}: {
    titleId: string;
    seasons: MediaLibraryTvSeasonOverview[];
    targetPathOptions: MediaLibraryPathOption[];
    currentLibraryPathId: string | null;
}) {
    const [activeSeasonNumber, setActiveSeasonNumber] = useState(seasons[0]?.seasonNumber ?? 1);
    const [missingOnly, setMissingOnly] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const [bulkPending, startBulk] = useTransition();
    const [bulkMessage, setBulkMessage] = useState<string | null>(null);
    const [bulkMessageStatus, setBulkMessageStatus] = useState<"success" | "error">("success");
    const [lastBulkTarget, setLastBulkTarget] = useState<boolean | null>(null);
    // Episodes are fetched per season and cached, so switching back to a season
    // already viewed does not re-hit the server.
    const [cache, setCache] = useState<Record<number, EpisodeFetchState>>({});
    const loadingRef = useRef<Set<number>>(new Set());

    const activeSeason =
        seasons.find((season) => season.seasonNumber === activeSeasonNumber) ?? seasons[0] ?? null;

    const loadSeason = useCallback(
        async (seasonNumber: number) => {
            if (loadingRef.current.has(seasonNumber)) {
                return;
            }

            loadingRef.current.add(seasonNumber);
            setCache((current) => ({ ...current, [seasonNumber]: { kind: "loading" } }));

            try {
                const result = await loadTvSeasonEpisodesForLibraryAction(titleId, seasonNumber);

                setCache((current) => ({
                    ...current,
                    [seasonNumber]:
                        result.status === "ok"
                            ? { kind: "loaded", episodes: result.episodes }
                            : { kind: "error", message: "Could not load episodes." },
                }));
            } catch {
                setCache((current) => ({
                    ...current,
                    [seasonNumber]: { kind: "error", message: "Could not load episodes." },
                }));
            } finally {
                loadingRef.current.delete(seasonNumber);
            }
        },
        [titleId],
    );

    const retrySeason = useCallback(
        (seasonNumber: number) => {
            void loadSeason(seasonNumber);
        },
        [loadSeason],
    );

    useEffect(() => {
        if (!activeSeason) {
            return;
        }

        const cachedState = cache[activeSeason.seasonNumber];

        if (cachedState) {
            return;
        }

        // The action is awaited, so no state update happens synchronously here.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadSeason(activeSeason.seasonNumber);
    }, [activeSeason, cache, loadSeason]);

    if (!activeSeason) {
        return (
            <p className="px-5 py-9 text-center text-[13px] text-muted">
                No episodes have been discovered for this series yet.
            </p>
        );
    }

    const state = cache[activeSeason.seasonNumber] ?? { kind: "idle" as const };
    const allEpisodes = state.kind === "loaded" ? state.episodes : [];
    // Episode rows only render after the client-side load resolves, so reading
    // the clock here cannot desync from a server render.
    const today = toCalendarDate(new Date());
    const visibleEpisodes = missingOnly
        ? allEpisodes.filter((episode) => isMissing(episode, today))
        : allEpisodes;
    // Counted apart: an unaired episode is not missing, and lumping the two
    // together makes a season look incomplete when it is merely still airing.
    const missingCount = allEpisodes.filter((episode) => isMissing(episode, today)).length;
    const unairedCount = allEpisodes.filter(
        (episode) =>
            hasNoFile(episode) && episodeAvailability(episode.airDate, today) === "upcoming",
    ).length;
    const unknownDateCount = allEpisodes.filter(
        (episode) =>
            hasNoFile(episode) && episodeAvailability(episode.airDate, today) === "unknown",
    ).length;
    const unmonitoredCount = allEpisodes.filter((e) => !e.monitored).length;

    /** Applies the existing per-episode action across the selection, in order. */
    const applyMonitoring = (monitored: boolean) => {
        const ids = [...selected];

        startBulk(async () => {
            setBulkMessage(null);
            setBulkMessageStatus("success");
            setLastBulkTarget(monitored);

            const succeededIds: string[] = [];
            const failedIds: string[] = [];
            const failureMessages: string[] = [];

            for (const episodeId of ids) {
                const formData = new FormData();

                formData.set("episodeId", episodeId);

                if (monitored) {
                    formData.set("monitored", "on");
                }

                try {
                    const result = await updateTvEpisodeMonitoringAction(
                        initialTvEpisodeMonitoringActionState,
                        formData,
                    );

                    if (result.status === "success") {
                        succeededIds.push(episodeId);
                    } else {
                        failedIds.push(episodeId);
                        failureMessages.push(result.message ?? "Could not update this episode.");
                    }
                } catch {
                    failedIds.push(episodeId);
                    failureMessages.push("Could not update this episode.");
                }
            }

            setCache((current) => {
                const seasonState = current[activeSeason.seasonNumber];

                if (seasonState?.kind !== "loaded") {
                    return current;
                }

                return {
                    ...current,
                    [activeSeason.seasonNumber]: {
                        kind: "loaded",
                        episodes: seasonState.episodes.map((episode) =>
                            succeededIds.includes(episode.id) ? { ...episode, monitored } : episode,
                        ),
                    },
                };
            });

            setSelected(failedIds);

            if (failedIds.length === 0) {
                setLastBulkTarget(null);
                setBulkMessage(
                    `${succeededIds.length} ${succeededIds.length === 1 ? "episode" : "episodes"} ${monitored ? "monitored" : "unmonitored"}.`,
                );

                return;
            }

            setBulkMessageStatus("error");
            const failureSummary = failureMessages[0] ?? "Try again.";
            const successSummary =
                succeededIds.length > 0
                    ? `${succeededIds.length} ${succeededIds.length === 1 ? "episode" : "episodes"} updated. `
                    : "No episodes were updated. ";

            setBulkMessage(
                `${successSummary}${failedIds.length} ${failedIds.length === 1 ? "episode" : "episodes"} failed: ${failureSummary} Use ${monitored ? "Retry monitor" : "Retry unmonitor"} to try the failed rows again.`,
            );
        });
    };

    const toggleSeasonMonitoring = () => {
        startBulk(async () => {
            setBulkMessage(null);
            setBulkMessageStatus("success");
            setLastBulkTarget(null);
            const formData = new FormData();

            formData.set("seasonId", activeSeason.id);

            if (!activeSeason.monitored) {
                formData.set("monitored", "on");
            }

            try {
                const result = await updateTvSeasonMonitoringAction(
                    initialTvSeasonMonitoringActionState,
                    formData,
                );

                if (result.status === "success") {
                    setBulkMessage(
                        `Season ${activeSeason.seasonNumber} ${activeSeason.monitored ? "unmonitored" : "monitored"}.`,
                    );

                    return;
                }

                setBulkMessageStatus("error");
                setBulkMessage(result.message ?? "Could not update this season. Try again.");
            } catch {
                setBulkMessageStatus("error");
                setBulkMessage("Could not update this season. Try again.");
            }
        });
    };

    return (
        <>
            {/* Season chips */}
            <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-cream/[0.06] px-5 py-3.5">
                {seasons.map((season) => {
                    const active = season.seasonNumber === activeSeason.seasonNumber;
                    const seasonMissing = season.episodeCount - season.availableEpisodeCount;

                    return (
                        <button
                            key={season.id}
                            type="button"
                            disabled={bulkPending}
                            onClick={() => {
                                setActiveSeasonNumber(season.seasonNumber);
                                setSelected([]);
                                setBulkMessage(null);
                                setLastBulkTarget(null);
                            }}
                            aria-current={active ? "true" : undefined}
                            className={cn(
                                "inline-flex shrink-0 items-baseline gap-[7px] rounded-[9px] border px-[13px] py-2 text-[13.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                                active
                                    ? "border-accent/55 bg-accent/[0.13] text-accent"
                                    : "border-cream/[0.09] bg-cream/[0.03] text-foreground hover:border-cream/[0.16]",
                            )}
                        >
                            <span>S{season.seasonNumber}</span>
                            <span
                                className={cn(
                                    "text-[11.5px] font-medium",
                                    active
                                        ? "text-accent/75"
                                        : seasonMissing > 0
                                          ? "text-accent"
                                          : "text-muted",
                                )}
                            >
                                {season.availableEpisodeCount}/{season.episodeCount}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Season header */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3.5 border-b border-cream/[0.06] px-5 py-3">
                <div className="min-w-0">
                    <p className="font-heading text-[18px] leading-[1.15] text-foreground">
                        {activeSeason.title ?? `Season ${activeSeason.seasonNumber}`}
                    </p>
                    <p className="mt-[3px] text-xs text-muted">
                        {[
                            `${activeSeason.episodeCount} episodes`,
                            `${activeSeason.availableEpisodeCount} available`,
                            missingCount > 0 ? `${missingCount} missing` : null,
                            unairedCount > 0 ? `${unairedCount} unaired` : null,
                            unknownDateCount > 0 ? `${unknownDateCount} unknown` : null,
                            unmonitoredCount > 0 ? `${unmonitoredCount} unmonitored` : null,
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                    </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setMissingOnly((current) => !current)}
                        aria-pressed={missingOnly}
                        className={cn(
                            "inline-flex min-h-11 items-center rounded-full border px-[13px] text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                            missingOnly
                                ? "border-accent/50 bg-accent/[0.12] text-accent"
                                : "border-cream/[0.12] text-muted hover:text-foreground",
                        )}
                    >
                        Missing only
                    </button>
                    <button
                        type="button"
                        onClick={toggleSeasonMonitoring}
                        disabled={bulkPending}
                        className="inline-flex min-h-11 items-center rounded-full border border-cream/[0.14] bg-cream/[0.04] px-[13px] text-[12.5px] font-semibold text-foreground transition hover:bg-cream/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
                    >
                        {activeSeason.monitored ? "Unmonitor season" : "Monitor season"}
                    </button>
                    <LibraryItemSearchForm
                        titleId={titleId}
                        seasonId={activeSeason.id}
                        label="Search season"
                        targetPathOptions={targetPathOptions}
                        currentLibraryPathId={currentLibraryPathId}
                        compact
                    />
                </div>
            </div>

            {/* Column header */}
            <div
                className={cn(
                    rowGrid,
                    "h-8 shrink-0 border-b border-cream/[0.06] text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted/75",
                )}
            >
                <span />
                <span>Ep</span>
                <span>Title</span>
                <span className="hidden sm:block">Quality</span>
                <span className="hidden sm:block">Airs</span>
                <span className="hidden sm:block">Added</span>
                <span />
            </div>

            {/* Rows */}
            <div className="relative min-h-0 flex-1 overflow-auto pb-2">
                {state.kind === "loading" || state.kind === "idle" ? (
                    <p className="px-5 py-9 text-center text-[13px] text-muted">
                        Loading episodes…
                    </p>
                ) : null}
                {state.kind === "error" ? (
                    <div
                        role="alert"
                        className="flex flex-col items-center px-5 py-9 text-center text-[13px] text-accent-wine"
                    >
                        <p>{state.message}</p>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="mt-3"
                            onClick={() => retrySeason(activeSeason.seasonNumber)}
                        >
                            Try again
                        </Button>
                    </div>
                ) : null}
                {state.kind === "loaded" && visibleEpisodes.length === 0 ? (
                    <p className="px-5 py-9 text-center text-[13px] text-muted">
                        {missingOnly
                            ? "No aired episodes without files in this season."
                            : "No episodes have been discovered for this season yet."}
                    </p>
                ) : null}

                {visibleEpisodes.map((episode) => {
                    const checked = selected.includes(episode.id);
                    const availability = episodeAvailability(episode.airDate, today);
                    const aired = availability === "aired";
                    // Only an aired episode can be missing; an unaired one is simply
                    // not out yet, and colouring it as missing implies work to do.
                    const missing = isMissing(episode, today);

                    return (
                        <div
                            key={episode.id}
                            className={cn(
                                rowGrid,
                                "min-h-11 border-b border-cream/[0.045] transition",
                                checked ? "bg-accent/[0.08]" : "hover:bg-cream/[0.035]",
                                episode.monitored ? null : "opacity-[0.62]",
                            )}
                        >
                            <label className="inline-flex min-h-11 cursor-pointer items-center">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                        setLastBulkTarget(null);
                                        setSelected((current) =>
                                            current.includes(episode.id)
                                                ? current.filter((id) => id !== episode.id)
                                                : [...current, episode.id],
                                        );
                                    }}
                                    className="peer sr-only"
                                />
                                <span className="sr-only">Select {episodeCode(episode)}</span>
                                <span
                                    aria-hidden="true"
                                    className="flex h-4 w-4 items-center justify-center rounded-[5px] border border-cream/[0.22] transition peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-focus"
                                >
                                    {checked ? (
                                        <Check
                                            aria-hidden="true"
                                            size={11}
                                            className="text-accent-foreground"
                                        />
                                    ) : null}
                                </span>
                            </label>
                            <span
                                className={cn(
                                    "text-xs font-semibold tabular-nums tracking-[0.02em]",
                                    missing ? "text-accent" : "text-muted",
                                )}
                            >
                                {episodeCode(episode)}
                            </span>
                            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="min-w-0 line-clamp-2 text-[13.5px] text-foreground sm:truncate">
                                    {episode.title ?? `Episode ${episode.episodeNumber}`}
                                </span>
                                {episode.monitored ? null : (
                                    <span className="hidden shrink-0 text-[11px] text-muted/85 sm:inline">
                                        unmonitored
                                    </span>
                                )}
                                <span className="block basis-full truncate text-[11px] text-muted sm:hidden">
                                    {qualityLabel(episode, today)}
                                    {!episode.monitored ? " · unmonitored" : ""}
                                </span>
                            </span>
                            <span
                                className={cn(
                                    "hidden truncate text-[12.5px] sm:block",
                                    missing ? "font-semibold text-accent" : "text-muted",
                                )}
                            >
                                {qualityLabel(episode, today)}
                            </span>
                            <span
                                title={airDateTooltip(episode, today)}
                                className={cn(
                                    "hidden truncate text-[12.5px] tabular-nums sm:block",
                                    aired ? "text-muted" : "font-semibold text-accent-cool",
                                )}
                            >
                                {airDateLabel(episode)}
                            </span>
                            <span className="hidden text-[12.5px] text-muted sm:block">
                                {episode.lastFileModifiedAt
                                    ? episode.lastFileModifiedAt.toLocaleDateString(undefined, {
                                          month: "short",
                                          day: "numeric",
                                      })
                                    : "—"}
                            </span>
                            <LibraryItemSearchForm
                                titleId={titleId}
                                episodeId={episode.id}
                                label={`Search ${episodeCode(episode)}`}
                                targetPathOptions={targetPathOptions}
                                currentLibraryPathId={currentLibraryPathId}
                                compact
                            />
                        </div>
                    );
                })}
            </div>

            {/* Bulk action bar */}
            {selected.length > 0 ? (
                <div
                    role="group"
                    aria-label="Selected episode actions"
                    className="nk-rise sticky bottom-0 z-10 mx-3 flex flex-wrap items-center gap-1.5 rounded-2xl border border-cream/[0.14] bg-panel-raised p-2.5 shadow-[0_22px_44px_-18px_rgba(0,0,0,0.95)]"
                >
                    <span className="basis-full px-1 text-[13px] font-semibold text-foreground sm:mr-auto sm:basis-auto">
                        {selected.length} {selected.length === 1 ? "episode" : "episodes"} selected
                    </span>
                    <button
                        type="button"
                        onClick={() => applyMonitoring(true)}
                        disabled={bulkPending}
                        className="nk-button-primary inline-flex min-h-11 items-center rounded-full px-3.5 text-[12.5px] disabled:opacity-60"
                    >
                        {bulkPending
                            ? "Working…"
                            : lastBulkTarget === true
                              ? "Retry monitor"
                              : "Monitor"}
                    </button>
                    <button
                        type="button"
                        onClick={() => applyMonitoring(false)}
                        disabled={bulkPending}
                        className="inline-flex min-h-11 items-center rounded-full px-3 text-[12.5px] font-semibold text-foreground transition hover:bg-cream/[0.08] disabled:opacity-60"
                    >
                        {lastBulkTarget === false ? "Retry unmonitor" : "Unmonitor"}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setSelected([]);
                            setLastBulkTarget(null);
                        }}
                        aria-label="Clear selection"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-cream/[0.08] hover:text-foreground"
                    >
                        <X aria-hidden="true" size={15} />
                    </button>
                    {bulkMessage ? (
                        <p
                            role={bulkMessageStatus === "error" ? "alert" : "status"}
                            className="basis-full px-1 pt-1 text-xs leading-5 text-muted"
                        >
                            {bulkMessage}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {bulkMessage && selected.length === 0 ? (
                <p
                    role={bulkMessageStatus === "error" ? "alert" : "status"}
                    className="shrink-0 border-t border-cream/[0.06] px-5 py-2 text-xs text-muted"
                >
                    {bulkMessage}
                </p>
            ) : null}
        </>
    );
}
