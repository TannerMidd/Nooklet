"use client";

import { ListChecks } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DownloadNowToggle } from "@/components/media-library/download-now-toggle";
import {
    TvRequestDialog,
    describeTvSelection,
    type TvSelectionState,
} from "@/components/media-library/tv-request-dialog";
import { type MediaQualityProfile, type RecommendationMediaType } from "@/lib/database/schema";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";

export type LibraryOption = {
    id: string;
    name: string;
    mediaType: RecommendationMediaType;
};

export type QualityProfileOption = {
    value: MediaQualityProfile;
    label: string;
};

type TitleRequestControlsProps = {
    mediaType: RecommendationMediaType;
    tmdbId: number | null;
    titleLabel: string;
    libraries: LibraryOption[];
    qualityProfiles: readonly QualityProfileOption[];
    pathOptions: MediaLibraryPathOption[];
    defaultQualityProfile?: MediaQualityProfile;
    defaultDownloadNow?: boolean;
    onDownloadNowChange?: (downloadNow: boolean) => void;
};

function pathOptionLabel(option: MediaLibraryPathOption) {
    return `${option.label} - ${option.path}${option.isDownloadDefault ? " (default)" : ""}`;
}

function preferredPathId(options: MediaLibraryPathOption[]) {
    return (options.find((option) => option.isDownloadDefault) ?? options[0])?.id ?? "";
}

/**
 * Shared request controls used by every entry point that adds a title:
 * library / destination-folder / quality selects, the Monitor checkbox, the
 * TV season/episode picker, and the standard download-now toggle. Renders
 * inside a form and submits libraryId, targetLibraryPathId, qualityProfile,
 * monitored, downloadNow, and the picker's selection fields.
 */
export function TitleRequestControls({
    mediaType,
    tmdbId,
    titleLabel,
    libraries,
    qualityProfiles,
    pathOptions,
    defaultQualityProfile = "hd-1080p",
    defaultDownloadNow = true,
    onDownloadNowChange,
}: TitleRequestControlsProps) {
    const matchingLibraries = libraries.filter((library) => library.mediaType === mediaType);
    const matchingPathOptions = pathOptions.filter((option) => option.mediaType === mediaType);
    const defaultPathOption = matchingPathOptions.find((option) => option.isDownloadDefault);
    const initialLibraryId = defaultPathOption?.libraryId ?? matchingLibraries[0]?.id ?? "";
    const initialTargetPathId = preferredPathId(
        initialLibraryId
            ? matchingPathOptions.filter((option) => option.libraryId === initialLibraryId)
            : matchingPathOptions,
    );
    const [selectedLibraryId, setSelectedLibraryId] = useState(initialLibraryId);
    const [selectedTargetPathId, setSelectedTargetPathId] = useState(initialTargetPathId);
    const [selection, setSelection] = useState<TvSelectionState>({ mode: "all" });
    const [dialogOpen, setDialogOpen] = useState(false);
    const [qualityProfile, setQualityProfile] = useState(defaultQualityProfile);
    const [downloadNow, setDownloadNow] = useState(defaultDownloadNow);
    const [monitored, setMonitored] = useState(true);
    const visiblePathOptions = selectedLibraryId
        ? matchingPathOptions.filter((option) => option.libraryId === selectedLibraryId)
        : [];
    const isTv = mediaType === "tv";
    const hasPicker = isTv && tmdbId !== null;
    const selectedLibrary =
        matchingLibraries.find((library) => library.id === selectedLibraryId) ?? null;
    const selectedPath =
        matchingPathOptions.find((option) => option.id === selectedTargetPathId) ?? null;
    const selectedQuality = qualityProfiles.find((profile) => profile.value === qualityProfile);
    const destinationLabel = selectedPath
        ? `${selectedLibrary?.name ?? "Library"} / ${selectedPath.label} — ${selectedPath.path}`
        : "No active destination folder selected";

    function handleDownloadNowChange(nextDownloadNow: boolean) {
        setDownloadNow(nextDownloadNow);
        onDownloadNowChange?.(nextDownloadNow);
    }

    function handleLibraryChange(value: string) {
        setSelectedLibraryId(value);
        const nextPathOptions = value
            ? matchingPathOptions.filter((option) => option.libraryId === value)
            : [];

        setSelectedTargetPathId(preferredPathId(nextPathOptions));
    }

    return (
        <>
            {isTv ? (
                <>
                    <input type="hidden" name="selectionMode" value={selection.mode} />
                    {selection.mode === "seasons"
                        ? selection.seasons.map((seasonNumber) => (
                              <input
                                  key={`season-${seasonNumber}`}
                                  type="hidden"
                                  name="selectedSeasons"
                                  value={seasonNumber}
                              />
                          ))
                        : null}
                    {selection.mode === "episodes" ? (
                        <>
                            <input type="hidden" name="selectedSeason" value={selection.season} />
                            {selection.episodes.map((episodeNumber) => (
                                <input
                                    key={`episode-${episodeNumber}`}
                                    type="hidden"
                                    name="selectedEpisodes"
                                    value={episodeNumber}
                                />
                            ))}
                        </>
                    ) : null}
                </>
            ) : null}
            <div className="grid gap-3 lg:grid-cols-3">
                <label className="space-y-1 text-sm">
                    <span className="font-medium text-foreground">Library</span>
                    <select
                        name="libraryId"
                        value={selectedLibraryId}
                        onChange={(event) => handleLibraryChange(event.target.value)}
                        className="min-h-11 w-full rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-cream/[0.04] focus:ring-1 focus:ring-accent/25"
                    >
                        <option value="">Unassigned</option>
                        {matchingLibraries.map((library) => (
                            <option key={library.id} value={library.id}>
                                {library.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1 text-sm">
                    <span className="font-medium text-foreground">Destination folder</span>
                    <select
                        name="targetLibraryPathId"
                        value={selectedTargetPathId}
                        onChange={(event) => setSelectedTargetPathId(event.target.value)}
                        disabled={visiblePathOptions.length === 0}
                        className="min-h-11 w-full rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-cream/[0.04] focus:ring-1 focus:ring-accent/25 disabled:opacity-60"
                    >
                        {visiblePathOptions.length === 0 ? (
                            <option value="">No active folders</option>
                        ) : (
                            visiblePathOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {pathOptionLabel(option)}
                                </option>
                            ))
                        )}
                    </select>
                </label>
                <label className="space-y-1 text-sm">
                    <span className="font-medium text-foreground">Quality profile</span>
                    <select
                        name="qualityProfile"
                        value={qualityProfile}
                        onChange={(event) =>
                            setQualityProfile(event.target.value as MediaQualityProfile)
                        }
                        className="min-h-11 w-full rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-cream/[0.04] focus:ring-1 focus:ring-accent/25"
                    >
                        {qualityProfiles.map((profile) => (
                            <option key={profile.value} value={profile.value}>
                                {profile.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-muted">
                <label className="inline-flex min-h-11 items-center gap-2 rounded-md border border-cream/[0.08] bg-cream/[0.03] px-3 py-2">
                    <input
                        type="checkbox"
                        name="monitored"
                        checked={monitored}
                        onChange={(event) => setMonitored(event.target.checked)}
                        className="h-5 w-5 accent-accent"
                    />
                    Monitor
                </label>
                {hasPicker ? (
                    <button
                        type="button"
                        onClick={() => setDialogOpen(true)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-cream/[0.08] bg-cream/[0.03] px-3 py-2 text-foreground"
                    >
                        <ListChecks aria-hidden="true" size={15} />
                        {describeTvSelection(selection)}
                    </button>
                ) : null}
            </div>
            <DownloadNowToggle
                downloadNow={downloadNow}
                onDownloadNowChange={handleDownloadNowChange}
            />
            <section
                className="rounded-xl border border-cream/[0.1] bg-background/25 p-3.5"
                aria-label="Request summary"
                aria-live="polite"
            >
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">
                    Request summary
                </p>
                <dl className="mt-2 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="text-xs text-muted">Title and scope</dt>
                        <dd className="mt-0.5 font-medium text-foreground">
                            {mediaType === "tv"
                                ? `TV / ${describeTvSelection(selection)}`
                                : "Movie"}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted">Destination</dt>
                        <dd
                            className={
                                selectedPath
                                    ? "mt-0.5 break-all font-medium text-foreground"
                                    : "mt-0.5 font-medium text-accent-wine"
                            }
                        >
                            {destinationLabel}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted">Preferred quality</dt>
                        <dd className="mt-0.5 font-medium text-foreground">
                            {selectedQuality?.label ?? qualityProfile}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted">Monitoring</dt>
                        <dd className="mt-0.5 font-medium text-foreground">
                            {monitored ? "Monitor for missing content" : "Do not monitor"}
                        </dd>
                    </div>
                </dl>
                <p className="mt-3 border-t border-cream/[0.08] pt-2.5 text-xs leading-5 text-muted">
                    {downloadNow
                        ? "Nooklet will add this title, search indexers now, and queue the best matching release. The downloader may use temporary workspace before Nooklet imports files into the destination above. If nothing matches or queueing fails, the title stays Requested and no download is claimed."
                        : "Nooklet will add this title as Requested without searching indexers or queueing a download."}
                </p>
                {downloadNow && !selectedPath ? (
                    <div className="mt-2 flex flex-wrap gap-x-1 rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3 py-2 text-xs leading-5 text-foreground">
                        <span>
                            Download now needs an active {mediaType === "tv" ? "TV" : "movie"}{" "}
                            destination.
                        </span>
                        <Link
                            href="/settings/storage"
                            className="font-semibold text-accent underline underline-offset-2"
                        >
                            Open Storage settings
                        </Link>
                        <span>or choose Add to library only.</span>
                    </div>
                ) : null}
            </section>
            {hasPicker && dialogOpen ? (
                <TvRequestDialog
                    tmdbId={tmdbId}
                    titleLabel={titleLabel}
                    initialSelection={selection}
                    onConfirm={(next) => {
                        setSelection(next);
                        setDialogOpen(false);
                    }}
                    onClose={() => setDialogOpen(false)}
                />
            ) : null}
        </>
    );
}
