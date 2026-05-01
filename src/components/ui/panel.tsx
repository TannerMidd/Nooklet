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
        "cozy-panel min-w-0 rounded-lg border border-line/65 bg-panel/95 p-5 sm:p-6",
        className,
      )}
    >
      <div className="space-y-2.5">
        {eyebrow ? (
          <p className="font-heading text-sm italic text-accent-cool">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="max-w-[24ch] font-heading text-[1.35rem] leading-[1.18] text-foreground sm:max-w-none sm:text-[1.65rem]">
          {title}
        </h2>
        {description ? <p className="max-w-2xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
