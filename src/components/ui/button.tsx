import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const buttonVariants = {
  primary: "border border-accent/20 bg-accent text-accent-foreground shadow-[0_10px_28px_rgba(91,202,183,0.18)] hover:bg-accent/90",
  secondary: "border border-line/80 bg-panel-strong/80 text-foreground hover:border-accent/35 hover:bg-panel",
  ghost: "border border-transparent bg-transparent text-muted hover:border-line/70 hover:bg-panel-strong/70 hover:text-foreground",
  danger: "border border-highlight/25 bg-highlight/10 text-highlight hover:bg-highlight/20",
} satisfies Record<NonNullable<ButtonProps["variant"]>, string>;

const buttonSizes = {
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
        "inline-flex items-center justify-center rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-55",
        buttonSizes[size],
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
});
