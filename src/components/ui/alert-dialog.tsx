"use client";

import { AlertTriangle } from "lucide-react";
import { createPortal } from "react-dom";
import { type ReactNode, useCallback, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { usePortalTarget } from "@/components/ui/use-portal-target";

type AlertDialogProps = {
    open: boolean;
    title: string;
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
    description,
    confirmLabel,
    onConfirm,
    onClose,
    pending = false,
    tone = "danger",
}: AlertDialogProps) {
    const portalTarget = usePortalTarget();
    const cancelRef = useRef<HTMLButtonElement | null>(null);
    const titleId = useId();
    const descriptionId = useId();
    const stableClose = useCallback(() => onClose(), [onClose]);
    const dialogRef = useModalDialog({
        onClose: stableClose,
        initialFocusRef: cancelRef,
        enabled: open,
    });

    if (!open || !portalTarget) {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={onClose}
                className="absolute inset-0 h-full w-full nk-scrim nk-fade"
            />
            <section
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                className="relative w-full max-w-md nk-pop rounded-[20px] border border-cream/[0.10] bg-[rgb(23,21,19)] p-6 shadow-[0_44px_90px_-44px_rgba(0,0,0,0.95)] focus:outline-none"
            >
                <div className="flex gap-3">
                    <span
                        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone === "danger" ? "bg-accent-wine/15 text-accent-wine" : "bg-accent/15 text-accent"}`}
                    >
                        <AlertTriangle aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <h2 id={titleId} className="font-heading text-2xl text-foreground">
                            {title}
                        </h2>
                        <div id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
                            {description}
                        </div>
                    </div>
                </div>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                        ref={cancelRef}
                        variant="secondary"
                        onClick={onClose}
                        disabled={pending}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant={tone === "danger" ? "danger" : "primary"}
                        onClick={onConfirm}
                        disabled={pending}
                    >
                        {pending ? "Working…" : confirmLabel}
                    </Button>
                </div>
            </section>
        </div>,
        portalTarget,
    );
}
