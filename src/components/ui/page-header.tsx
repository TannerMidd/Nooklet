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
        "relative border-b border-line/60 pb-5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-4xl space-y-2.5">
          <p className="font-heading text-sm italic text-accent">
            {eyebrow}
          </p>
          <div className="space-y-2">
            <h1 className="font-heading text-3xl leading-tight text-foreground md:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="max-w-3xl text-sm leading-6 text-muted md:text-base">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </header>
  );
}