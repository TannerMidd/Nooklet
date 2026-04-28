import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-3xl border border-line/70 bg-[linear-gradient(135deg,rgba(35,42,52,0.94),rgba(22,27,34,0.96))] px-5 py-6 shadow-soft ring-1 ring-white/[0.03] backdrop-blur sm:px-6 md:px-8 xl:px-10",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(91,202,183,0.65),transparent)]" />
      <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-4xl space-y-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-accent sm:text-xs sm:tracking-[0.28em]">
            {eyebrow}
          </p>
          <div className="space-y-3">
            <h1 className="font-heading text-3xl leading-tight tracking-normal text-foreground sm:text-4xl md:text-5xl">
              {title}
            </h1>
            {description ? (
              <p className="max-w-3xl text-sm leading-6 text-muted md:text-base md:leading-7">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </header>
  );
}