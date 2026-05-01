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
        "cozy-panel nooklet-hero-surface relative overflow-hidden rounded-xl border border-accent-cool/25 px-5 py-6 sm:px-6 md:px-8 xl:px-10",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-4xl space-y-3">
          <p className="font-heading text-sm italic text-accent-cool">
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