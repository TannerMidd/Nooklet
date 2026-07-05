import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type PanelProps = {
  title: string;
  children?: ReactNode;
  className?: string;
  description?: string;
  /** Retained for API compatibility; category eyebrows are no longer rendered. */
  eyebrow?: string;
};

export function Panel({
  title,
  children,
  className,
  description,
}: PanelProps) {
  return (
    <section
      className={cn(
        "cozy-panel min-w-0 rounded-lg border border-line/50 bg-panel/85 p-4 sm:p-5",
        className,
      )}
    >
      <div className="space-y-0.5">
        <h2 className="font-heading text-lg leading-snug text-foreground">
          {title}
        </h2>
        {description ? <p className="max-w-2xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {children ? <div className="mt-3.5">{children}</div> : null}
    </section>
  );
}
