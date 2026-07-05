"use client";

import { ListChecks } from "lucide-react";
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
};

function pathOptionLabel(option: MediaLibraryPathOption) {
  return `${option.label} - ${option.path}`;
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
}: TitleRequestControlsProps) {
  const matchingLibraries = libraries.filter((library) => library.mediaType === mediaType);
  const matchingPathOptions = pathOptions.filter((option) => option.mediaType === mediaType);
  const initialLibraryId = matchingLibraries[0]?.id ?? "";
  const initialTargetPathId = initialLibraryId
    ? matchingPathOptions.find((option) => option.libraryId === initialLibraryId)?.id ?? ""
    : matchingPathOptions[0]?.id ?? "";
  const [selectedLibraryId, setSelectedLibraryId] = useState(initialLibraryId);
  const [selectedTargetPathId, setSelectedTargetPathId] = useState(initialTargetPathId);
  const [selection, setSelection] = useState<TvSelectionState>({ mode: "all" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const visiblePathOptions = matchingPathOptions.filter((option) => (
    selectedLibraryId ? option.libraryId === selectedLibraryId : true
  ));
  const isTv = mediaType === "tv";
  const hasPicker = isTv && tmdbId !== null;

  function handleLibraryChange(value: string) {
    setSelectedLibraryId(value);
    const nextPathOptions = matchingPathOptions.filter((option) => (value ? option.libraryId === value : true));
    setSelectedTargetPathId(nextPathOptions[0]?.id ?? "");
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
            className="min-h-9 w-full rounded-lg border border-line/75 bg-background/25 px-3 py-1.5 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25"
          >
            <option value="">Unassigned</option>
            {matchingLibraries.map((library) => (
              <option key={library.id} value={library.id}>{library.name}</option>
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
            className="min-h-9 w-full rounded-lg border border-line/75 bg-background/25 px-3 py-1.5 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25 disabled:opacity-60"
          >
            {visiblePathOptions.length === 0 ? (
              <option value="">No active folders</option>
            ) : (
              visiblePathOptions.map((option) => (
                <option key={option.id} value={option.id}>{pathOptionLabel(option)}</option>
              ))
            )}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">Quality profile</span>
          <select
            name="qualityProfile"
            defaultValue={defaultQualityProfile}
            className="min-h-9 w-full rounded-lg border border-line/75 bg-background/25 px-3 py-1.5 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25"
          >
            {qualityProfiles.map((profile) => (
              <option key={profile.value} value={profile.value}>{profile.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-3 text-sm text-muted">
        <label className="inline-flex items-center gap-2 rounded-lg border border-line/60 bg-background/20 px-2.5 py-1.5">
          <input type="checkbox" name="monitored" defaultChecked className="h-4 w-4 accent-accent" />
          Monitor
        </label>
        {hasPicker ? (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-line/60 bg-background/20 px-2.5 py-1.5 text-foreground"
          >
            <ListChecks aria-hidden="true" size={15} />
            {describeTvSelection(selection)}
          </button>
        ) : null}
      </div>
      <DownloadNowToggle defaultDownloadNow={defaultDownloadNow} />
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
