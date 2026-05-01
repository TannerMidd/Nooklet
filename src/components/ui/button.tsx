import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
};

const buttonVariants = {
  primary: "cozy-glow nooklet-button-primary border border-accent/55 text-accent-foreground",
  secondary: "border border-line/75 bg-panel-strong/70 text-foreground hover:border-accent/35 hover:bg-panel-raised/70",
  ghost: "border border-transparent bg-transparent text-muted hover:border-line/60 hover:bg-panel-strong/35 hover:text-foreground",
  danger: "border border-accent-wine/35 bg-accent-wine/12 text-foreground hover:bg-accent-wine/20",
} satisfies Record<NonNullable<ButtonProps["variant"]>, string>;

const buttonSizes = {
  icon: "h-9 min-h-9 w-9 px-0 py-0 text-xs",
  sm: "min-h-10 px-3 py-2 text-xs",
  md: "min-h-11 px-4 py-2 text-sm",
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
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-55 [&>svg]:shrink-0",
        buttonSizes[size],
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
});
