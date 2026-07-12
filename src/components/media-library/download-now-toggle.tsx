"use client";

import { cn } from "@/lib/utils";

type DownloadNowToggleProps = {
  defaultDownloadNow?: boolean;
  className?: string;
};

const segmentClass =
  "cursor-pointer px-3 py-1.5 text-xs font-medium text-muted transition select-none " +
  "has-[:checked]:bg-accent has-[:checked]:text-accent-foreground hover:text-foreground has-[:checked]:hover:text-accent-foreground";

/**
 * Segmented "Download now" / "Add only" choice shared by every request entry
 * point. Submits `downloadNow` as "on" or "off"; server actions treat only
 * "on" as an immediate download.
 */
export function DownloadNowToggle({ defaultDownloadNow = true, className }: DownloadNowToggleProps) {
  return (
    <fieldset
      className={cn(
        "inline-flex w-fit overflow-hidden rounded-md border border-cream/[0.08] bg-cream/[0.03]",
        className,
      )}
    >
      <legend className="sr-only">Download behavior</legend>
      <label className={segmentClass}>
        <input
          type="radio"
          name="downloadNow"
          value="on"
          defaultChecked={defaultDownloadNow}
          className="sr-only"
        />
        Download now
      </label>
      <label className={cn(segmentClass, "border-l border-cream/[0.08]")}>
        <input
          type="radio"
          name="downloadNow"
          value="off"
          defaultChecked={!defaultDownloadNow}
          className="sr-only"
        />
        Add only
      </label>
    </fieldset>
  );
}
