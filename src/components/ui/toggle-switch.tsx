import { type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Redesign toggle: a 40x24 track with an 18px knob. On is accent with a dark
 * knob; off is a faint cream track with a muted knob.
 *
 * The control is a visually hidden checkbox with the pill painted from its
 * `:checked` state, so it still posts with the surrounding form and keeps
 * native keyboard and screen-reader behaviour.
 */
export const toggleTrack =
    "flex h-6 w-10 shrink-0 items-center justify-start rounded-full bg-cream/[0.10] p-[3px] transition peer-checked:justify-end peer-checked:bg-accent peer-checked:[&>span]:bg-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-focus";

export const toggleKnob = "block h-[18px] w-[18px] rounded-full bg-muted transition";

/** The bare control — pair it with your own row chrome. */
export function ToggleControl({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
    return (
        <>
            <input type="checkbox" className={cn("peer sr-only", className)} {...props} />
            <span aria-hidden="true" className={toggleTrack}>
                <span className={toggleKnob} />
            </span>
        </>
    );
}

type ToggleFieldProps = InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    description?: string;
    /** Hairline above the row, as the redesign stacks these in a single card. */
    divided?: boolean;
};

/** A full settings row: label and description on the left, toggle on the right. */
export function ToggleField({
    label,
    description,
    divided = true,
    className,
    ...props
}: ToggleFieldProps) {
    return (
        <label
            className={cn(
                "flex cursor-pointer items-center justify-between gap-4 py-3",
                divided ? "border-t border-cream/[0.05]" : null,
                className,
            )}
        >
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                {description ? (
                    <span className="mt-0.5 block text-[13px] leading-5 text-muted">
                        {description}
                    </span>
                ) : null}
            </span>
            <ToggleControl {...props} />
        </label>
    );
}
