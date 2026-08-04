import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatStripEntry = {
  label: string;
  value: ReactNode;
};

/**
 * Totals row from the redesign: one bordered container whose cells are joined
 * by hairlines. The 1px grid gap lets the container's cream fill show through
 * as the divider, so the strip reads as a single object rather than a row of
 * cards.
 */
export function StatStrip({
  entries,
  className,
}: {
  entries: readonly StatStripEntry[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-px overflow-hidden rounded-2xl border border-cream/[0.08] bg-cream/[0.08]",
        className,
      )}
    >
      {entries.map((entry) => (
        <div key={entry.label} className="min-w-0 bg-panel px-5 py-[18px]">
          <p className="font-heading text-3xl leading-[1.05] break-words text-foreground">
            {entry.value}
          </p>
          <p className="mt-[7px] text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">
            {entry.label}
          </p>
        </div>
      ))}
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: ReactNode;
  /** `lg` is the oversized figure the redesign uses for library totals. */
  size?: "md" | "lg";
  className?: string;
};

export function StatCard({ label, value, size = "md", className }: StatCardProps) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border border-cream/[0.08] bg-cream/[0.03] p-5",
        className,
      )}
    >
      <p
        className={cn(
          "break-words font-heading leading-none text-foreground",
          size === "lg" ? "text-[34px]" : "text-3xl",
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
    </div>
  );
}
