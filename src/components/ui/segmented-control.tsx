import Link from "next/link";
import { type ReactNode } from "react";

import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { cn } from "@/lib/utils";

/**
 * Redesign segmented control: a cream-tinted track holding equal pills, with
 * the active segment filled in accent. Used for scope switches that are
 * mutually exclusive — media type, availability view, layout.
 */
export const segmentedTrack = "inline-flex rounded-lg bg-cream/[0.05] p-[3px]";

export const segmentedItem =
    "relative inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export const segmentedItemActive = "bg-accent text-accent-foreground";

export const segmentedItemInactive = "text-muted hover:text-foreground";

export function segmentedItemClass(active: boolean, className?: string) {
    return cn(segmentedItem, active ? segmentedItemActive : segmentedItemInactive, className);
}

type SegmentedLinkOption = {
    href: string;
    label: ReactNode;
    active: boolean;
    key?: string;
};

/** Link-driven variant for server-rendered scope switches. */
export function SegmentedLinks({
    options,
    label,
    className,
}: {
    options: readonly SegmentedLinkOption[];
    label: string;
    className?: string;
}) {
    return (
        <div className={cn(segmentedTrack, className)} role="group" aria-label={label}>
            {options.map((option) => (
                <Link
                    key={option.key ?? option.href}
                    href={option.href}
                    aria-current={option.active ? "page" : undefined}
                    className={segmentedItemClass(option.active)}
                >
                    <LinkPendingOverlay />
                    {option.label}
                </Link>
            ))}
        </div>
    );
}
