import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "min-h-9 w-full rounded-lg border border-line/75 bg-background/25 px-3 py-1.5 text-sm text-foreground outline-none transition placeholder:text-muted/75 focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      />
    );
  },
);
