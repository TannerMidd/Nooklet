import { type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "neutral" | "accent" | "accent-cool" | "highlight" | "wine";
};

const badgeVariants = {
  neutral: "border-line/45 bg-background/25 text-muted",
  accent: "border-accent/30 bg-accent/10 text-foreground",
  "accent-cool": "border-accent-cool/30 bg-accent-cool/10 text-foreground",
  highlight: "border-highlight/30 bg-highlight/10 text-highlight",
  wine: "border-accent-wine/35 bg-accent-wine/10 text-foreground",
} satisfies Record<NonNullable<BadgeProps["variant"]>, string>;

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}
