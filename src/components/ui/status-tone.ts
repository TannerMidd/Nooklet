/**
 * Shared border/background/text tone classes for status-like values across
 * health, timelines, and activity surfaces.
 */
export function statusTone(status: string) {
  if (status === "verified" || status === "succeeded") {
    return "border-accent/20 bg-accent/10 text-foreground";
  }

  if (status === "error" || status === "failed" || status === "cancelled") {
    return "border-highlight/20 bg-highlight/10 text-highlight";
  }

  if (status === "pending") {
    return "border-line bg-panel text-muted";
  }

  return "border-line/70 bg-panel-strong/70 text-foreground";
}
