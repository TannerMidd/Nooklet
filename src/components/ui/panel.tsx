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
        "cozy-panel min-w-0 rounded-lg border border-line/65 bg-panel/95 p-4 sm:p-5",
        className,
      )}
    >
      <div className="space-y-1">
        {eyebrow ? (
          <p className="font-heading text-xs italic text-accent-cool">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-heading text-lg leading-snug text-foreground sm:text-xl">
          {title}
        </h2>
        {description ? <p className="max-w-2xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
