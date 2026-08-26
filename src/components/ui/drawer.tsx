"use client";

import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { usePortalTarget } from "@/components/ui/use-portal-target";
import { cn } from "@/lib/utils";

type DrawerProps = {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    id?: string;
    side?: "left" | "right";
    className?: string;
};

/** True while the viewport is below 640px and drawers render as sheets. */
function useIsSheet() {
    const [isSheet, setIsSheet] = useState(false);

    useEffect(() => {
        const query = window.matchMedia("(max-width: 639px)");

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsSheet(query.matches);

        function handleChange(event: MediaQueryListEvent) {
            setIsSheet(event.matches);
        }

        query.addEventListener("change", handleChange);

        return () => query.removeEventListener("change", handleChange);
    }, []);

    return isSheet;
}

export function Drawer({
    open,
    onClose,
    title,
    children,
    id,
    side = "right",
    className,
}: DrawerProps) {
    const portalTarget = usePortalTarget();
    const isSheet = useIsSheet();
    const stableClose = useCallback(() => onClose(), [onClose]);
    const dialogRef = useModalDialog<HTMLElement>({ onClose: stableClose, enabled: open });

    if (!open || !portalTarget) {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 z-[80]">
            <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={stableClose}
                className="absolute inset-0 h-full w-full cursor-default nk-scrim nk-fade"
            />
            {/* Below 640px navigation arrives as a bottom sheet — reachable with
        the thumb that opened it. Above that it stays a side drawer. */}
            {isSheet ? (
                <div className="absolute inset-x-0 bottom-0 flex justify-center">
                    <aside
                        ref={dialogRef}
                        id={id}
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        tabIndex={-1}
                        className={cn(
                            "nk-sheet flex max-h-[92dvh] w-full flex-col rounded-t-[24px] border-t border-x border-cream/[0.12] bg-[rgb(23,21,19)] shadow-[0_48px_100px_-40px_rgba(0,0,0,0.95)] focus:outline-none",
                            className,
                        )}
                    >
                        <div className="flex shrink-0 cursor-default justify-center pt-2.5">
                            <span className="h-1 w-10 rounded-full bg-cream/[0.28]" />
                        </div>
                        <div className="flex min-h-14 items-center justify-between gap-3 px-5 pb-2">
                            <h2 className="font-heading text-xl leading-[1.15] text-foreground">
                                {title}
                            </h2>
                            <button
                                type="button"
                                onClick={stableClose}
                                aria-label={`Close ${title.toLowerCase()}`}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-cream/[0.10] bg-cream/[0.03] text-muted hover:bg-cream/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            >
                                <X aria-hidden="true" className="h-[18px] w-[18px]" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                            {children}
                        </div>
                    </aside>
                </div>
            ) : (
                <aside
                    ref={dialogRef}
                    id={id}
                    role="dialog"
                    aria-modal="true"
                    aria-label={title}
                    tabIndex={-1}
                    className={cn(
                        "nk-pop absolute inset-y-0 flex w-[min(88vw,22rem)] flex-col border-cream/[0.10] bg-[rgb(23,21,19)] shadow-[0_44px_90px_-44px_rgba(0,0,0,0.95)] focus:outline-none",
                        side === "left" ? "left-0 border-r" : "right-0 border-l",
                        className,
                    )}
                >
                    <div className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-cream/[0.07] px-5">
                        <h2 className="font-heading text-[21px] text-foreground">{title}</h2>
                        <button
                            type="button"
                            onClick={stableClose}
                            aria-label={`Close ${title.toLowerCase()}`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-cream/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                            <X aria-hidden="true" className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
                </aside>
            )}
        </div>,
        portalTarget,
    );
}
