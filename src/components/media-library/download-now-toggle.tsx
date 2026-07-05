"use client";

import { cn } from "@/lib/utils";

type DownloadNowToggleProps = {
  defaultDownloadNow?: boolean;
  className?: string;
};

/**
 * Standard "Add & download now" vs "Add only (monitored)" choice shared by
 * every request entry point. Submits `downloadNow` as "on" or "off"; server
 * actions treat only "on" as an immediate download.
 */
export function DownloadNowToggle({ defaultDownloadNow = true, className }: DownloadNowToggleProps) {
  return (
    <fieldset className={cn("flex flex-wrap gap-2 text-sm text-muted", className)}>
      <legend className="sr-only">Download behavior</legend>
      <label className="inline-flex items-center gap-2 rounded-lg border border-line/60 bg-background/20 px-3 py-2">
        <input
          type="radio"
          name="downloadNow"
          value="on"
          defaultChecked={defaultDownloadNow}
          className="h-4 w-4 accent-accent"
        />
        Add &amp; download now
      </label>
      <label className="inline-flex items-center gap-2 rounded-lg border border-line/60 bg-background/20 px-3 py-2">
        <input
          type="radio"
          name="downloadNow"
          value="off"
          defaultChecked={!defaultDownloadNow}
          className="h-4 w-4 accent-accent"
        />
        Add only (monitored)
      </label>
    </fieldset>
  );
}
