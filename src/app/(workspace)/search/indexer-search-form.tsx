"use client";

import { CalendarDays, DatabaseZap, HardDrive, Search } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  initialIndexerSearchActionState,
  searchIndexersAction,
  type IndexerSearchActionState,
  type SearchResultView,
} from "@/app/(workspace)/search/actions";
import { QueueResultButton } from "@/app/(workspace)/search/queue-result-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function StatusBanner({ state }: { state: IndexerSearchActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <p
      className={
        state.status === "success"
          ? "rounded-lg border border-line/70 bg-panel-strong/70 px-4 py-2 text-sm text-foreground"
          : "rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-200"
      }
    >
      {state.message}
    </p>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
      <Search aria-hidden="true" size={17} />
      {pending ? "Searching..." : "Search"}
    </Button>
  );
}

function formatBytes(value: number | null) {
  if (value === null) {
    return "Unknown size";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatPublishedAt(value: string | null) {
  if (!value) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function mediaTypeLabel(mediaType: SearchResultView["mediaType"]) {
  return mediaType === "tv" ? "TV" : "Movie";
}

function SearchResults({ state }: { state: IndexerSearchActionState }) {
  if (state.status === "idle") {
    return (
      <p className="rounded-lg border border-dashed border-line/75 bg-background/20 p-4 text-sm text-muted">
        No search has run yet.
      </p>
    );
  }

  if (state.results.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line/75 bg-background/20 p-4 text-sm text-muted">
        No results found.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {state.results.map((result) => (
        <li key={result.id} className="rounded-lg border border-line/70 bg-panel-strong/60 p-4">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
                  {mediaTypeLabel(result.mediaType)}
                </span>
                {result.qualityLabel ? (
                  <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
                    {result.qualityLabel}
                  </span>
                ) : null}
              </div>
              <p className="break-words font-heading text-lg leading-tight text-foreground">{result.title}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 lg:min-w-[440px] lg:items-end">
              <div className="grid w-full gap-2 text-sm text-muted sm:grid-cols-3">
                <span className="inline-flex items-center gap-2 rounded-lg border border-line/60 bg-background/20 px-3 py-2">
                  <HardDrive aria-hidden="true" size={15} />
                  {formatBytes(result.sizeBytes)}
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg border border-line/60 bg-background/20 px-3 py-2">
                  <CalendarDays aria-hidden="true" size={15} />
                  {formatPublishedAt(result.publishedAt)}
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg border border-line/60 bg-background/20 px-3 py-2">
                  <DatabaseZap aria-hidden="true" size={15} />
                  S {result.seeders ?? "?"} / L {result.leechers ?? "?"} / G {result.grabs ?? "?"}
                </span>
              </div>
              <QueueResultButton resultId={result.id} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function IndexerSearchForm() {
  const [state, formAction] = useActionState(
    searchIndexersAction,
    initialIndexerSearchActionState,
  );

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-4">
        <StatusBanner state={state} />
        <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Media type</span>
            <select
              name="mediaType"
              defaultValue="movie"
              className="min-h-11 w-full rounded-lg border border-line/75 bg-background/25 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25"
            >
              <option value="movie">Movies</option>
              <option value="tv">TV shows</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Title</span>
            <Input name="query" placeholder="Arrival" required />
          </label>
          <SubmitButton />
        </div>
      </form>

      <SearchResults state={state} />
    </div>
  );
}
