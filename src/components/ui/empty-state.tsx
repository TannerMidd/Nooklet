import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  message: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ message, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-line/75 bg-background/20 p-4",
        className,
      )}
    >
      <p className="text-sm leading-6 text-muted">{message}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
