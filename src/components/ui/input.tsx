import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";

import { controlSurface, selectSurface } from "@/components/ui/control-surface";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
    function Input({ className, ...props }, ref) {
        return <input ref={ref} className={cn(controlSurface, className)} {...props} />;
    },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
    function Select({ className, ...props }, ref) {
        return <select ref={ref} className={cn(selectSurface, className)} {...props} />;
    },
);
