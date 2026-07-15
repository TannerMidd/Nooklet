import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
};

const buttonVariants = {
  primary: "nk-button-primary font-semibold",
  secondary:
    "border border-cream/[0.14] bg-cream/[0.04] font-semibold text-foreground hover:bg-cream/[0.08]",
  ghost:
    "border border-transparent bg-transparent font-semibold text-muted hover:bg-cream/[0.06] hover:text-foreground",
  danger:
    "border border-accent-wine/30 bg-transparent font-semibold text-accent-wine hover:bg-accent-wine/10",
} satisfies Record<NonNullable<ButtonProps["variant"]>, string>;

/* Small buttons render as pills (row actions); md keeps the 12px control radius. */
const buttonSizes = {
  icon: "h-11 min-h-11 w-11 rounded-full px-0 py-0 text-xs",
  sm: "min-h-11 rounded-full px-4 py-2 text-xs",
  md: "min-h-11 rounded-lg px-5 py-2 text-sm",
} satisfies Record<NonNullable<ButtonProps["size"]>, string>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, type = "button", variant = "primary", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55 [&>svg]:shrink-0",
        buttonSizes[size],
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
});
