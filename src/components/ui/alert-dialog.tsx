"use client";

import { type ReactNode, useId } from "react";

import { DialogShell } from "@/components/ui/dialog-shell";

type AlertDialogProps = {
    open: boolean;
    title: string;
    /** Uppercase micro-label above the title (e.g. "Permanent"). */
    eyebrow?: string;
    /** Supporting line under the title (e.g. "This cannot be undone"). */
    subtitle?: ReactNode;
    description: ReactNode;
    confirmLabel: string;
    onConfirm: () => void;
    onClose: () => void;
    pending?: boolean;
    tone?: "danger" | "warning";
};

export function AlertDialog({
    open,
    title,
    eyebrow,
    subtitle,
    description,
    confirmLabel,
    onConfirm,
    onClose,
    pending = false,
    tone = "danger",
}: AlertDialogProps) {
    const titleId = useId();
    const descriptionId = useId();

    if (!open) {
        return null;
    }

    return (
        <DialogShell
            titleId={titleId}
            describedById={descriptionId}
            size="sm"
            zIndex={200}
            eyebrow={eyebrow ?? (tone === "danger" ? "Permanent" : "Heads up")}
            title={title}
            sub={subtitle}
            onClose={onClose}
            footer={{
                label: undefined,
                value: undefined,
                danger: tone === "danger",
                cancel: { onClick: onClose, disabled: pending },
                primary: {
                    label: pending ? "Working…" : confirmLabel,
                    onClick: onConfirm,
                    disabled: pending,
                    danger: tone === "danger",
                },
            }}
        >
            <div id={descriptionId} className="text-sm leading-6 text-muted">
                {description}
            </div>
        </DialogShell>
    );
}
