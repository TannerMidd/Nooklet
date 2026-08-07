import { type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "neutral" | "accent" | "accent-cool" | "highlight" | "wine";
};

const badgeVariants = {
  neutral: "bg-cream/[0.06] text-muted",
  accent: "bg-accent/[0.14] text-accent",
  "accent-cool": "bg-accent-cool/[0.12] text-accent-cool",
  highlight: "bg-accent/[0.14] text-accent",
  wine: "border border-accent-wine/30 bg-accent-wine/[0.12] text-foreground",
} satisfies Record<NonNullable<BadgeProps["variant"]>, string>;

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}
