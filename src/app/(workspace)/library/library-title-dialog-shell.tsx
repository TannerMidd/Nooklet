"use client";

import { type ReactNode, useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DialogFooterConfig, DialogShell } from "@/components/ui/dialog-shell";

type LibraryTitleDialogShellProps = {
    labelledBy: string;
    closeHref: string;
    eyebrow?: ReactNode;
    title?: ReactNode;
    sub?: ReactNode;
    subBar?: ReactNode;
    footer?: DialogFooterConfig | null;
    children: ReactNode;
};

/**
 * Thin wrapper around the shared DialogShell that keeps the library dialog's
 * URL-based close behavior: closing hides the panel optimistically while the
 * back-navigation transition runs, so the dialog never lingers on
 * force-dynamic pages waiting for the parent server component to re-render.
 */
export function LibraryTitleDialogShell({
    labelledBy,
    closeHref,
    eyebrow,
    title,
    sub,
    subBar,
    footer,
    children,
}: LibraryTitleDialogShellProps) {
    const router = useRouter();
    const [isClosing, setIsClosing] = useState(false);
    const [, startTransition] = useTransition();

    const closeDialog = useCallback(() => {
        setIsClosing(true);
        startTransition(() => {
            router.replace(closeHref, { scroll: false });
        });
    }, [closeHref, router]);

    if (isClosing) {
        return null;
    }

    return (
        <DialogShell
            titleId={labelledBy}
            size="full"
            zIndex={150}
            eyebrow={eyebrow}
            title={title}
            sub={sub}
            onClose={closeDialog}
            subBar={subBar}
            footer={footer}
        >
            {children}
        </DialogShell>
    );
}
