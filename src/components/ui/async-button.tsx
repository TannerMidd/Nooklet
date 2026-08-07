"use client";

import { useFormStatus } from "react-dom";
import { type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type AsyncButtonProps = Omit<ComponentProps<typeof Button>, "disabled"> & {
    pendingLabel: string;
    disabled?: boolean;
};

/** Submit button with duplicate-submission protection and an announced label. */
export function AsyncButton({ children, pendingLabel, disabled, ...props }: AsyncButtonProps) {
    const { pending } = useFormStatus();

    return (
        <Button {...props} disabled={disabled || pending} aria-disabled={disabled || pending}>
            {pending ? <Spinner aria-hidden="true" /> : null}
            <span aria-live="polite">{pending ? pendingLabel : children}</span>
        </Button>
    );
}
