import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
};

const buttonVariants = {
  primary: "cozy-glow border border-accent/30 bg-accent text-accent-foreground hover:bg-accent/90",
  secondary: "border border-line/80 bg-panel-strong/70 text-foreground hover:border-accent/40 hover:bg-panel-strong",
  ghost: "border border-transparent bg-transparent text-muted hover:border-line/70 hover:text-foreground",
  danger: "border border-highlight/30 bg-highlight/10 text-highlight hover:bg-highlight/20",
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
