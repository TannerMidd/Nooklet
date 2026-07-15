import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "min-h-11 w-full rounded-lg border border-control bg-cream/[0.04] px-3.5 py-2 text-sm text-foreground outline-none transition placeholder:text-placeholder focus:border-focus focus:ring-2 focus:ring-focus/25 aria-[invalid=true]:border-accent-wine aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-accent-wine/20 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      />
    );
  },
);
