/**
 * Shared background/text tone classes for status-like values across health,
 * timelines, and activity surfaces. Teal = healthy, amber = active/attention,
 * wine = failure, cream = neutral.
 */
export function statusTone(status: string) {
    if (status === "verified" || status === "succeeded") {
        return "bg-accent-cool/[0.12] text-accent-cool";
    }

    if (status === "error" || status === "failed" || status === "cancelled") {
        return "bg-accent-wine/[0.12] text-accent-wine";
    }

    if (status === "pending") {
        return "bg-cream/[0.06] text-muted";
    }

    return "bg-cream/[0.06] text-foreground";
}
