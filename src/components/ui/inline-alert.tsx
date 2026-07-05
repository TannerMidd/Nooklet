import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type InlineAlertProps = {
  children: ReactNode;
  variant?: "error" | "warning" | "success" | "info";
  className?: string;
};

const alertVariants = {
  error: "border-accent-wine/40 bg-accent-wine/10 text-foreground",
  warning: "border-highlight/30 bg-highlight/10 text-highlight",
  success: "border-accent/25 bg-accent/10 text-foreground",
  info: "border-line/45 bg-panel-strong/35 text-muted",
} satisfies Record<NonNullable<InlineAlertProps["variant"]>, string>;

export function InlineAlert({ children, variant = "info", className }: InlineAlertProps) {
  return (
    <p
      role={variant === "error" ? "alert" : undefined}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm leading-6",
        alertVariants[variant],
        className,
      )}
    >
      {children}
    </p>
  );
}
