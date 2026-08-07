"use client";

import { useId, type ReactNode } from "react";

import { fieldLabel } from "@/components/ui/control-surface";
import { cn } from "@/lib/utils";

export type FormFieldControlProps = {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
    "aria-errormessage"?: string;
    required?: boolean;
};

type FormFieldProps = {
    label: string;
    children: (controlProps: FormFieldControlProps) => ReactNode;
    description?: string;
    error?: string | null;
    required?: boolean;
    id?: string;
    className?: string;
};

/** A form-field contract that keeps labels, help text, errors and controls
 * programmatically connected across every settings and authentication form. */
export function FormField({
    label,
    children,
    description,
    error,
    required,
    id,
    className,
}: FormFieldProps) {
    const generatedId = useId();
    const controlId = id ?? `field-${generatedId.replaceAll(":", "")}`;
    const descriptionId = description ? `${controlId}-description` : undefined;
    const errorId = error ? `${controlId}-error` : undefined;
    const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

    return (
        <div className={cn("space-y-1.5", className)}>
            <label htmlFor={controlId} className={fieldLabel}>
                {label}
                {required ? (
                    <span className="ml-1 text-accent" aria-hidden="true">
                        *
                    </span>
                ) : null}
            </label>
            {description ? (
                <p id={descriptionId} className="text-sm leading-5 text-muted">
                    {description}
                </p>
            ) : null}
            {children({
                id: controlId,
                "aria-describedby": describedBy,
                "aria-invalid": error ? true : undefined,
                "aria-errormessage": errorId,
                required,
            })}
            {error ? (
                <p id={errorId} role="alert" className="text-sm leading-5 text-accent-wine">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
