"use client";

import { type ReactNode, useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DialogShell } from "@/components/ui/dialog-shell";

type RecommendationOverviewModalShellProps = {
    titleId: string;
    closeHref: string;
    /** Uppercase micro-label above the title (e.g. "Movie · 2024"). */
    eyebrow?: ReactNode;
    /** Pinned-header title; the element carrying titleId lives in the shell. */
    title?: ReactNode;
    /** Supporting line under the title (availability/status). */
    subtitle?: ReactNode;
    children: ReactNode;
};

export function RecommendationOverviewModalShell({
    titleId,
    closeHref,
    eyebrow,
    title = "Title overview",
    subtitle,
    children,
}: RecommendationOverviewModalShellProps) {
    const router = useRouter();
    // Hide the modal optimistically while the URL transition runs in the
    // background. Without this the dialog stays mounted until the parent
    // server component re-renders, which is the source of the noticeable
    // close lag on `force-dynamic` pages like /history and /discover.
    const [isClosing, setIsClosing] = useState(false);
    const [, startTransition] = useTransition();

    const closeModal = useCallback(() => {
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
            titleId={titleId}
            size="xl"
            zIndex={130}
            eyebrow={eyebrow}
            title={title}
            sub={subtitle}
            onClose={closeModal}
        >
            {children}
        </DialogShell>
    );
}
