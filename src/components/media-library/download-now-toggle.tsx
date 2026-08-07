"use client";

import { cn } from "@/lib/utils";

type DownloadNowToggleProps = {
    defaultDownloadNow?: boolean;
    downloadNow?: boolean;
    onDownloadNowChange?: (downloadNow: boolean) => void;
    className?: string;
};

const segmentClass =
    "inline-flex min-h-11 cursor-pointer items-center px-4 py-2 text-sm font-medium text-muted transition select-none " +
    "has-[:checked]:bg-accent has-[:checked]:text-accent-foreground hover:text-foreground has-[:checked]:hover:text-accent-foreground " +
    "has-[:focus-visible]:relative has-[:focus-visible]:z-10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-focus";

/**
 * Segmented "Download now" / "Add only" choice shared by every request entry
 * point. Submits `downloadNow` as "on" or "off"; server actions treat only
 * "on" as an immediate download.
 */
export function DownloadNowToggle({
    defaultDownloadNow = true,
    downloadNow,
    onDownloadNowChange,
    className,
}: DownloadNowToggleProps) {
    const isControlled = typeof downloadNow === "boolean";

    return (
        <fieldset
            className={cn(
                "inline-flex w-fit overflow-hidden rounded-lg border border-cream/[0.14] bg-cream/[0.03]",
                className,
            )}
        >
            <legend className="sr-only">Download behavior</legend>
            <label className={segmentClass}>
                <input
                    type="radio"
                    name="downloadNow"
                    value="on"
                    checked={isControlled ? downloadNow : undefined}
                    defaultChecked={isControlled ? undefined : defaultDownloadNow}
                    onChange={() => onDownloadNowChange?.(true)}
                    className="sr-only"
                />
                Download now
            </label>
            <label className={cn(segmentClass, "border-l border-cream/[0.10]")}>
                <input
                    type="radio"
                    name="downloadNow"
                    value="off"
                    checked={isControlled ? !downloadNow : undefined}
                    defaultChecked={isControlled ? undefined : !defaultDownloadNow}
                    onChange={() => onDownloadNowChange?.(false)}
                    className="sr-only"
                />
                Add to library only
            </label>
        </fieldset>
    );
}
