import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type PanelProps = {
  title: string;
  children?: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
};

export function Panel({
  title,
  children,
  className,
  description,
  eyebrow,
}: PanelProps) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-3xl border border-line/70 bg-panel/90 p-5 shadow-soft ring-1 ring-white/[0.03] backdrop-blur sm:p-6",
        className,
      )}
    >
      <div className="space-y-2.5">
        {eyebrow ? (
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-accent sm:text-xs sm:tracking-[0.3em]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="max-w-[22ch] font-heading text-[1.45rem] leading-[1.15] tracking-normal text-foreground sm:max-w-none sm:text-2xl">
          {title}
        </h2>
        {description ? <p className="max-w-2xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
