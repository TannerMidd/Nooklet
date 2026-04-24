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
        "min-w-0 rounded-[28px] border border-line/80 bg-panel/90 p-5 shadow-soft backdrop-blur sm:p-6",
        className,
      )}
    >
      <div className="space-y-2.5">
        {eyebrow ? (
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-accent sm:text-xs sm:tracking-[0.3em]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="max-w-[20ch] font-heading text-[1.55rem] leading-[1.12] text-foreground sm:max-w-none sm:text-2xl">
          {title}
        </h2>
        {description ? <p className="max-w-2xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
