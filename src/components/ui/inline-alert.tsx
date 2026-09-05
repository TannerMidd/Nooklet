import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type InlineAlertProps = {
    children: ReactNode;
    variant?: "error" | "warning" | "success" | "info";
    className?: string;
};

const alertVariants = {
    error: "border-accent-wine/30 bg-accent-wine/10 text-foreground",
    warning: "border-accent/30 bg-accent/10 text-foreground",
    success: "border-accent-cool/30 bg-accent-cool/10 text-foreground",
    info: "border-cream/10 bg-cream/[0.04] text-muted",
} satisfies Record<NonNullable<InlineAlertProps["variant"]>, string>;

export function InlineAlert({ children, variant = "info", className }: InlineAlertProps) {
    return (
        <div
            role={variant === "error" ? "alert" : "status"}
            className={cn(
                "rounded-lg border px-3.5 py-2 text-sm leading-6",
                alertVariants[variant],
                className,
            )}
        >
            {children}
        </div>
    );
}
