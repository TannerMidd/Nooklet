import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "min-h-[42px] w-full rounded-lg border border-cream/10 bg-cream/[0.04] px-3.5 py-1.5 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent/45 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      />
    );
  },
);
