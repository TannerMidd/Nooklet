import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type PanelProps = {
  title: string;
  children?: ReactNode;
  className?: string;
  description?: string;
  /** Retained for API compatibility; panel-level eyebrows are not rendered. */
  eyebrow?: string;
  /** Right-aligned header actions (buttons, links). */
  actions?: ReactNode;
};

export function Panel({
  title,
  children,
  className,
  description,
  actions,
}: PanelProps) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-2xl border border-cream/[0.08] bg-cream/[0.03] p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="font-heading text-[21px] leading-snug text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-[13px] leading-5 text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
