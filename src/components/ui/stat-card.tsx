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
        "rounded-lg border border-line/45 bg-panel-strong/45 px-3 py-2.5 text-sm leading-6",
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 font-heading text-lg text-foreground">{value}</p>
    </div>
  );
}
