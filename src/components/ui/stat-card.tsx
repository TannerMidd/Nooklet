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
        "rounded-lg border border-line/70 bg-panel-strong/70 px-4 py-3 text-sm leading-6",
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-heading text-xl text-foreground">{value}</p>
    </div>
  );
}
