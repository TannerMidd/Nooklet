import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: ReactNode;
  className?: string;
};

export function StatCard({ label, value, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border border-cream/[0.08] bg-cream/[0.03] p-5",
        className,
      )}
    >
      <p className="break-words font-heading text-3xl leading-none text-foreground">
        {value}
      </p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
    </div>
  );
}
