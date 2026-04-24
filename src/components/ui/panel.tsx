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
        "rounded-[28px] border border-line/80 bg-panel/90 p-6 shadow-soft backdrop-blur",
        className,
      )}
    >
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-heading text-2xl text-foreground">{title}</h2>
        {description ? <p className="max-w-2xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
