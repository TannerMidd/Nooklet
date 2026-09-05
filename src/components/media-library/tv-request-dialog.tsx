"use client";

import { useEffect, useId, useMemo, useState } from "react";

import {
    loadTmdbTvSeasonEpisodesAction,
    loadTmdbTvSeasonsAction,
} from "@/app/(workspace)/search/actions";
import { Button } from "@/components/ui/button";
import {
    DialogPill,
    DialogRow,
    DialogRowCheck,
    DialogRowChip,
    DialogShell,
} from "@/components/ui/dialog-shell";
import {
    type TmdbTvEpisodeSummary,
    type TmdbTvSeasonSummary,
} from "@/modules/service-connections/adapters/tmdb";

export type TvSelectionState =
    | { mode: "all" }
    | { mode: "seasons"; seasons: number[] }
    | { mode: "episodes"; season: number; episodes: number[] };

type TvRequestPickerProps = {
    tmdbId: number;
    selection: TvSelectionState | null;
    onSelectionChange: (selection: TvSelectionState | null) => void;
    monitoredSeasons?: readonly number[];
    monitoredEpisodes?: readonly { season: number; episode: number }[];
};

function summarizeSeasons(season: TmdbTvSeasonSummary) {
    if (season.seasonNumber === 0) {
        return "Specials";
    }

    return `Season ${season.seasonNumber}`;
}

function shortSeasonLabel(seasonNumber: number | null) {
    if (seasonNumber === null) {
        return "—";
    }

    return seasonNumber === 0 ? "Sp" : `S${String(seasonNumber).padStart(2, "0")}`;
}

/** Horizontal rail of season chips used by the episodes mode. */
function SeasonChipRail({
    seasons,
    selectedSeason,
    onSelect,
}: {
    seasons: TmdbTvSeasonSummary[];
    selectedSeason: number | null;
    onSelect: (seasonNumber: number) => void;
}) {
    return (
        <div
            data-rail="true"
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="Pick a season"
        >
            {seasons.map((season) => (
                <DialogPill
                    key={season.seasonNumber}
                    active={selectedSeason === season.seasonNumber}
                    onClick={() => onSelect(season.seasonNumber!)}
                >
                    {shortSeasonLabel(season.seasonNumber)}
                </DialogPill>
            ))}
        </div>
    );
}

export function TvRequestPicker({
    tmdbId,
    selection,
    onSelectionChange,
    monitoredSeasons = [],
    monitoredEpisodes = [],
}: TvRequestPickerProps) {
    const [mode, setMode] = useState<TvSelectionState["mode"]>(selection?.mode ?? "seasons");
    const [seasons, setSeasons] = useState<TmdbTvSeasonSummary[]>([]);
    const [seasonsError, setSeasonsError] = useState<string | null>(null);
    const [seasonsLoading, setSeasonsLoading] = useState(false);
    const [seasonsRetryKey, setSeasonsRetryKey] = useState(0);
    const [selectedSeasons, setSelectedSeasons] = useState<number[]>(
        selection?.mode === "seasons" ? selection.seasons : [],
    );
    const [selectedSeason, setSelectedSeason] = useState<number | null>(
        selection?.mode === "episodes" ? selection.season : null,
    );
    const [episodes, setEpisodes] = useState<TmdbTvEpisodeSummary[]>([]);
    const [episodesError, setEpisodesError] = useState<string | null>(null);
    const [episodesLoading, setEpisodesLoading] = useState(false);
    const [episodesRetryKey, setEpisodesRetryKey] = useState(0);
    const [selectedEpisodes, setSelectedEpisodes] = useState<number[]>(
        selection?.mode === "episodes" ? selection.episodes : [],
    );

    const monitoredSet = useMemo(() => new Set(monitoredSeasons), [monitoredSeasons]);
    const monitoredEpisodeSet = useMemo(
        () => new Set(monitoredEpisodes.map((entry) => `${entry.season}:${entry.episode}`)),
        [monitoredEpisodes],
    );

    useEffect(() => {
        let active = true;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSeasonsLoading(true);
        setSeasonsError(null);

        void loadTmdbTvSeasonsAction(tmdbId)
            .then((result) => {
                if (!active) {
                    return;
                }

                if (result.ok) {
                    setSeasons(result.seasons.filter((season) => season.seasonNumber !== null));
                } else {
                    setSeasonsError(result.message);
                }
            })
            .catch(() => {
                if (active) {
                    setSeasonsError("Nooklet could not load seasons right now.");
                }
            })
            .finally(() => {
                if (active) {
                    setSeasonsLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [seasonsRetryKey, tmdbId]);

    useEffect(() => {
        if (mode !== "episodes" || selectedSeason === null) {
            return;
        }

        let active = true;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEpisodesLoading(true);
        setEpisodesError(null);

        void loadTmdbTvSeasonEpisodesAction(tmdbId, selectedSeason)
            .then((result) => {
                if (!active) {
                    return;
                }

                if (result.ok) {
                    setEpisodes(result.episodes);
                } else {
                    setEpisodesError(result.message);
                }
            })
            .catch(() => {
                if (active) {
                    setEpisodesError("Nooklet could not load episodes right now.");
                }
            })
            .finally(() => {
                if (active) {
                    setEpisodesLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [episodesRetryKey, mode, selectedSeason, tmdbId]);

    function emit(next: TvSelectionState | null) {
        onSelectionChange(next);
    }

    function changeMode(nextMode: TvSelectionState["mode"]) {
        setMode(nextMode);

        if (nextMode === "all") {
            emit({ mode: "all" });

            return;
        }

        if (nextMode === "seasons") {
            emit(selectedSeasons.length > 0 ? { mode: "seasons", seasons: selectedSeasons } : null);

            return;
        }

        if (selectedSeason !== null && selectedEpisodes.length > 0) {
            emit({ mode: "episodes", season: selectedSeason, episodes: selectedEpisodes });
        } else {
            emit(null);
        }
    }

    function toggleSeason(seasonNumber: number) {
        if (monitoredSet.has(seasonNumber)) {
            return;
        }

        setSelectedSeasons((current) => {
            const next = current.includes(seasonNumber)
                ? current.filter((value) => value !== seasonNumber)
                : [...current, seasonNumber].sort((a, b) => a - b);

            emit(next.length > 0 ? { mode: "seasons", seasons: next } : null);

            return next;
        });
    }

    function selectAllSeasons() {
        const next = seasons
            .map((season) => season.seasonNumber)
            .filter(
                (seasonNumber): seasonNumber is number =>
                    seasonNumber !== null && !monitoredSet.has(seasonNumber),
            );

        setSelectedSeasons(next);
        emit(next.length > 0 ? { mode: "seasons", seasons: next } : null);
    }

    function clearSeasons() {
        setSelectedSeasons([]);
        emit(null);
    }

    function pickEpisodeSeason(value: number | null) {
        setSelectedSeason(value);
        setSelectedEpisodes([]);
        emit(null);
    }

    function toggleEpisode(episodeNumber: number) {
        if (
            selectedSeason !== null &&
            monitoredEpisodeSet.has(`${selectedSeason}:${episodeNumber}`)
        ) {
            return;
        }

        setSelectedEpisodes((current) => {
            const next = current.includes(episodeNumber)
                ? current.filter((value) => value !== episodeNumber)
                : [...current, episodeNumber].sort((a, b) => a - b);

            if (selectedSeason !== null && next.length > 0) {
                emit({ mode: "episodes", season: selectedSeason, episodes: next });
            } else {
                emit(null);
            }

            return next;
        });
    }

    function selectAllEpisodes() {
        if (selectedSeason === null) {
            return;
        }

        const next = episodes
            .map((episode) => episode.episodeNumber)
            .filter(
                (episodeNumber) => !monitoredEpisodeSet.has(`${selectedSeason}:${episodeNumber}`),
            );

        setSelectedEpisodes(next);
        emit(next.length > 0 ? { mode: "episodes", season: selectedSeason, episodes: next } : null);
    }

    function clearEpisodes() {
        setSelectedEpisodes([]);
        emit(null);
    }

    const modeOptions: { value: TvSelectionState["mode"]; label: string }[] = [
        { value: "all", label: "Entire series" },
        { value: "seasons", label: "Seasons" },
        { value: "episodes", label: "Episodes" },
    ];

    return (
        <div className="space-y-3">
            <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="TV download selection mode"
            >
                {modeOptions.map((option) => (
                    <DialogPill
                        key={option.value}
                        active={mode === option.value}
                        onClick={() => changeMode(option.value)}
                    >
                        {option.label}
                    </DialogPill>
                ))}
            </div>

            {seasonsLoading ? (
                <p className="text-sm text-muted" role="status">
                    Loading seasons…
                </p>
            ) : seasonsError ? (
                <div
                    className="rounded-xl border border-accent-wine/40 bg-accent-wine/10 px-3 py-2 text-sm text-foreground"
                    role="alert"
                >
                    <p>{seasonsError}</p>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="mt-2"
                        onClick={() => setSeasonsRetryKey((current) => current + 1)}
                    >
                        Try again
                    </Button>
                </div>
            ) : null}

            {!seasonsLoading && !seasonsError && mode === "all" ? (
                <p className="text-sm leading-6 text-muted">
                    Every regular season will get its own recovery plan: Nooklet tries season packs
                    first, retries alternatives, then fills remaining episodes individually.
                </p>
            ) : null}

            {!seasonsLoading && !seasonsError && mode === "seasons" ? (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-muted" aria-live="polite">
                            {selectedSeasons.length} season{selectedSeasons.length === 1 ? "" : "s"}{" "}
                            selected
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={selectAllSeasons}
                            >
                                Select all available
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={clearSeasons}
                                disabled={selectedSeasons.length === 0}
                            >
                                Clear
                            </Button>
                        </div>
                    </div>
                    <ul className="space-y-1.5">
                        {seasons.map((season) => {
                            const seasonNumber = season.seasonNumber!;
                            const alreadyMonitored = monitoredSet.has(seasonNumber);

                            return (
                                <li key={seasonNumber}>
                                    <DialogRow locked={alreadyMonitored}>
                                        <label
                                            className={
                                                alreadyMonitored
                                                    ? "flex min-h-12 flex-1 cursor-default items-center gap-3"
                                                    : "flex min-h-12 flex-1 cursor-pointer items-center gap-3"
                                            }
                                        >
                                            {alreadyMonitored ? (
                                                <DialogRowCheck />
                                            ) : (
                                                <input
                                                    type="checkbox"
                                                    className="h-5 w-5 shrink-0 accent-accent"
                                                    checked={selectedSeasons.includes(seasonNumber)}
                                                    onChange={() => toggleSeason(seasonNumber)}
                                                />
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className="block font-medium text-current">
                                                    {summarizeSeasons(season)}
                                                </span>
                                                {season.episodeCount ? (
                                                    <span className="mt-px block text-[11.5px] text-muted">
                                                        {season.episodeCount} episodes
                                                    </span>
                                                ) : null}
                                            </span>
                                        </label>
                                        {alreadyMonitored ? (
                                            <DialogRowChip tone="cool">In library</DialogRowChip>
                                        ) : null}
                                    </DialogRow>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : null}

            {!seasonsLoading && !seasonsError && mode === "episodes" ? (
                <div className="space-y-3">
                    <SeasonChipRail
                        seasons={seasons}
                        selectedSeason={selectedSeason}
                        onSelect={(value) => pickEpisodeSeason(value)}
                    />

                    {selectedSeason !== null ? (
                        episodesLoading ? (
                            <p className="text-sm text-muted" role="status">
                                Loading episodes…
                            </p>
                        ) : episodesError ? (
                            <div
                                role="alert"
                                className="rounded-xl border border-accent-wine/40 bg-accent-wine/10 px-3 py-2 text-sm text-foreground"
                            >
                                <p>{episodesError}</p>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="mt-2"
                                    onClick={() => setEpisodesRetryKey((current) => current + 1)}
                                >
                                    Try again
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm text-muted" aria-live="polite">
                                        {selectedEpisodes.length} episode
                                        {selectedEpisodes.length === 1 ? "" : "s"} selected
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={selectAllEpisodes}
                                        >
                                            Select all available
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={clearEpisodes}
                                            disabled={selectedEpisodes.length === 0}
                                        >
                                            Clear
                                        </Button>
                                    </div>
                                </div>
                                <ul className="space-y-1.5">
                                    {episodes.map((episode) => {
                                        const alreadyMonitored =
                                            selectedSeason !== null &&
                                            monitoredEpisodeSet.has(
                                                `${selectedSeason}:${episode.episodeNumber}`,
                                            );

                                        return (
                                            <li key={episode.episodeNumber}>
                                                <DialogRow locked={alreadyMonitored}>
                                                    <label
                                                        className={
                                                            alreadyMonitored
                                                                ? "flex min-h-12 flex-1 cursor-default items-center gap-3"
                                                                : "flex min-h-12 flex-1 cursor-pointer items-center gap-3"
                                                        }
                                                    >
                                                        {alreadyMonitored ? (
                                                            <DialogRowCheck />
                                                        ) : (
                                                            <input
                                                                type="checkbox"
                                                                className="h-5 w-5 shrink-0 accent-accent"
                                                                checked={selectedEpisodes.includes(
                                                                    episode.episodeNumber,
                                                                )}
                                                                onChange={() =>
                                                                    toggleEpisode(
                                                                        episode.episodeNumber,
                                                                    )
                                                                }
                                                            />
                                                        )}
                                                        <span className="w-9 shrink-0 font-mono text-xs text-muted">
                                                            E
                                                            {String(episode.episodeNumber).padStart(
                                                                2,
                                                                "0",
                                                            )}
                                                        </span>
                                                        <span className="min-w-0 flex-1 truncate font-medium text-current">
                                                            {episode.name ?? "Episode"}
                                                        </span>
                                                    </label>
                                                    {alreadyMonitored ? (
                                                        <DialogRowChip tone="cool">
                                                            In library
                                                        </DialogRowChip>
                                                    ) : null}
                                                </DialogRow>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )
                    ) : (
                        <p className="text-sm text-muted">Pick a season to choose episodes.</p>
                    )}
                </div>
            ) : null}
        </div>
    );
}

type TvRequestDialogProps = {
    tmdbId: number;
    titleLabel: string;
    initialSelection: TvSelectionState;
    onConfirm: (selection: TvSelectionState) => void;
    onClose: () => void;
};

export function TvRequestDialog({
    tmdbId,
    titleLabel,
    initialSelection,
    onConfirm,
    onClose,
}: TvRequestDialogProps) {
    const [selection, setSelection] = useState<TvSelectionState | null>(initialSelection);
    const titleId = useId();

    function handleConfirm() {
        if (!selection) {
            return;
        }

        onConfirm(selection);
    }

    return (
        <DialogShell
            titleId={titleId}
            eyebrow="Step 2 of 2"
            title="Choose what to download"
            sub={titleLabel}
            size="md"
            zIndex={170}
            onClose={onClose}
            footer={{
                label: "Selected request",
                value: selection
                    ? describeTvSelection(selection)
                    : "Choose at least one season or episode",
                cancel: { label: "Cancel", onClick: onClose },
                primary: {
                    label: "Use this selection",
                    onClick: handleConfirm,
                    disabled: !selection,
                },
            }}
        >
            <TvRequestPicker
                tmdbId={tmdbId}
                selection={selection}
                onSelectionChange={setSelection}
            />
        </DialogShell>
    );
}

export function describeTvSelection(selection: TvSelectionState): string {
    if (selection.mode === "all") {
        return "Entire series";
    }

    if (selection.mode === "seasons") {
        if (selection.seasons.length === 1) {
            return `Season ${selection.seasons[0]}`;
        }

        return `${selection.seasons.length} seasons selected`;
    }

    if (selection.episodes.length === 1) {
        return `S${String(selection.season).padStart(2, "0")}E${String(selection.episodes[0]).padStart(2, "0")}`;
    }

    return `Season ${selection.season} · ${selection.episodes.length} episodes`;
}
