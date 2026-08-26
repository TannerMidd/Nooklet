"use client";

import { ChevronLeft, SlidersHorizontal, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type RefObject,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { usePortalTarget } from "@/components/ui/use-portal-target";
import { cn } from "@/lib/utils";

/**
 * The unified dialog anatomy from the Nooklet dialog redesign: every dialog
 * is a pinned header, optional pinned sub-bar (tabs / modes / search), one
 * scroll region, and a pinned footer. Below 640px the panel docks to the
 * bottom edge as a sheet with a grabber you can drag down to dismiss.
 */

export type DialogSize = "sm" | "md" | "lg" | "xl" | "full";

const sizeMaxWidth: Record<DialogSize, string> = {
    sm: "420px",
    md: "640px",
    lg: "880px",
    xl: "1200px",
    full: "1600px",
};

export type DialogFooterConfig = {
    /** Uppercase micro-label above the footer value ("Request", "Status", …). */
    label?: string;
    /** Live summary line under the label. */
    value?: ReactNode;
    danger?: boolean;
    options?: {
        label?: string;
        onClick: () => void;
    };
    cancel?: {
        label?: string;
        onClick?: () => void;
        disabled?: boolean;
    };
    primary: {
        label: ReactNode;
        onClick?: () => void;
        type?: "button" | "submit";
        danger?: boolean;
        disabled?: boolean;
        pending?: boolean;
    };
};

type DialogShellProps = {
    titleId: string;
    title: ReactNode;
    /** Element id describing the dialog body for aria-describedby. */
    describedById?: string;
    eyebrow?: ReactNode;
    sub?: ReactNode;
    size?: DialogSize;
    /** Panel alignment: centered (default) or near the top edge (palette). */
    align?: "center" | "top";
    /** Palette-style surfaces skip the header and keep only an sr-only title. */
    hideHeader?: boolean;
    zIndex?: number;
    onClose: () => void;
    onBack?: () => void;
    initialFocusRef?: RefObject<HTMLElement | null>;
    /** Pinned chrome between header and scroll region: tabs, mode pills, search. */
    subBar?: ReactNode;
    children: ReactNode;
    footer?: DialogFooterConfig | null;
    className?: string;
    bodyClassName?: string;
};

/** True while the viewport is below 640px and dialogs render as sheets. */
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

const dismissDragThreshold = 110;
const expandDragThreshold = 40;

export function DialogShell({
    titleId,
    title,
    describedById,
    eyebrow,
    sub,
    size = "md",
    align = "center",
    hideHeader = false,
    zIndex = 150,
    onClose,
    onBack,
    initialFocusRef,
    subBar,
    children,
    footer = null,
    className,
    bodyClassName,
}: DialogShellProps) {
    const portalTarget = usePortalTarget();
    const isSheet = useIsSheet();
    const [scrolled, setScrolled] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [dragY, setDragY] = useState(0);
    const dragFromRef = useRef<number | null>(null);
    const scrimPressRef = useRef(false);
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const stableClose = useCallback(() => onClose(), [onClose]);
    const dialogRef = useModalDialog({
        onClose: stableClose,
        initialFocusRef: initialFocusRef ?? closeButtonRef,
    });

    const resetTransientState = useCallback(() => {
        setScrolled(false);
        setExpanded(false);
        setDragY(0);
    }, []);

    const handleBack = onBack;

    const handleBodyScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
        setScrolled(event.currentTarget.scrollTop > 2);
    }, []);

    const handleGrabberDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragFromRef.current = event.clientY;
    }, []);

    const handleGrabberMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (dragFromRef.current === null) {
            return;
        }

        setDragY(Math.max(-140, event.clientY - dragFromRef.current));
    }, []);

    const handleGrabberUp = useCallback(() => {
        if (dragFromRef.current === null) {
            return;
        }

        dragFromRef.current = null;

        if (dragY > dismissDragThreshold) {
            stableClose();

            return;
        }

        if (dragY < -expandDragThreshold) {
            setExpanded(true);
        } else if (dragY > expandDragThreshold) {
            setExpanded(false);
        }

        setDragY(0);
    }, [dragY, stableClose]);

    if (!portalTarget) {
        return null;
    }

    const foot = footer;
    const primaryButton = foot?.primary;

    return createPortal(
        <div className="fixed inset-0" style={{ zIndex }}>
            {/* Scrim closes on pointer-up, never pointer-down, so a press that
        starts inside the panel and drifts out keeps your work. */}
            <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onPointerDown={() => {
                    scrimPressRef.current = true;
                }}
                onPointerUp={() => {
                    if (scrimPressRef.current) {
                        scrimPressRef.current = false;
                        stableClose();
                    }
                }}
                className="absolute inset-0 h-full w-full cursor-default nk-scrim nk-fade"
            />
            <div
                className={cn(
                    "absolute inset-0 flex justify-center pointer-events-none",
                    isSheet
                        ? "items-end p-0"
                        : cn(
                              align === "top"
                                  ? "items-start overflow-y-auto px-4 py-[10vh] sm:px-6 sm:pt-[11vh] sm:pb-6"
                                  : "items-center p-4 sm:p-8 md:p-12",
                          ),
                    !isSheet && size === "full"
                        ? "items-start overflow-y-auto py-[8vh] px-6 md:px-12"
                        : undefined,
                )}
            >
                <div
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    aria-describedby={describedById}
                    tabIndex={-1}
                    style={{
                        transform: dragY ? `translateY(${dragY}px)` : undefined,
                        maxWidth: isSheet ? undefined : sizeMaxWidth[size],
                    }}
                    className={cn(
                        "pointer-events-auto relative flex w-full flex-col overflow-hidden border border-cream/[0.12] bg-[rgb(23,21,19)] shadow-[0_48px_100px_-40px_rgba(0,0,0,0.95)] focus:outline-none",
                        isSheet
                            ? cn(
                                  "nk-sheet rounded-t-[24px]",
                                  expanded ? "h-[92dvh]" : "max-h-[75dvh]",
                              )
                            : cn("nk-pop max-h-full rounded-[20px]", size === "full" && "my-auto"),
                        className,
                    )}
                >
                    {isSheet ? (
                        <div
                            onPointerDown={handleGrabberDown}
                            onPointerMove={handleGrabberMove}
                            onPointerUp={handleGrabberUp}
                            className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-0.5"
                        >
                            <span className="h-1 w-10 rounded-full bg-cream/[0.28]" />
                        </div>
                    ) : null}

                    {/* ── pinned header (hidden for palette-style surfaces) */}
                    {hideHeader ? (
                        <h2 id={titleId} className="sr-only">
                            {title}
                        </h2>
                    ) : (
                        <div
                            className={cn(
                                "flex shrink-0 items-start gap-3 border-b transition-colors duration-150",
                                scrolled || subBar ? "border-cream/[0.08]" : "border-transparent",
                                isSheet ? "px-4 pb-3 pt-0.5 pl-4" : "px-4 py-4 sm:px-6",
                            )}
                        >
                            {handleBack ? (
                                <button
                                    type="button"
                                    aria-label="Back"
                                    onClick={() => {
                                        resetTransientState();
                                        handleBack();
                                    }}
                                    className="-ml-1 mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-cream/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                >
                                    <ChevronLeft aria-hidden="true" className="h-5 w-5" />
                                </button>
                            ) : null}
                            <div className="min-w-0 flex-1">
                                {eyebrow ? (
                                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
                                        {eyebrow}
                                    </p>
                                ) : null}
                                <h2
                                    id={titleId}
                                    className={cn(
                                        "font-heading text-pretty leading-[1.15] text-foreground",
                                        isSheet ? "text-xl" : "text-2xl",
                                    )}
                                >
                                    {title}
                                </h2>
                                {sub ? (
                                    <p className="mt-1 truncate text-[13px] text-muted">{sub}</p>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                ref={closeButtonRef}
                                aria-label="Close dialog"
                                onClick={() => {
                                    resetTransientState();
                                    stableClose();
                                }}
                                className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cream/[0.10] bg-cream/[0.03] text-muted transition hover:bg-cream/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            >
                                <X aria-hidden="true" className="h-[18px] w-[18px]" />
                            </button>
                        </div>
                    )}

                    {/* ── pinned sub-bar: tabs / modes / search ──────── */}
                    {subBar ? <div className="shrink-0">{subBar}</div> : null}

                    {/* ── one scroll region ──────────────────────────── */}
                    <div
                        onScroll={handleBodyScroll}
                        className={cn(
                            "min-h-0 flex-1 overflow-y-auto overscroll-contain",
                            isSheet ? "px-4 pb-5 pt-1" : "px-4 py-4 sm:px-6 sm:py-6",
                            bodyClassName,
                        )}
                    >
                        {children}
                    </div>

                    {/* ── pinned footer ──────────────────────────────── */}
                    {foot ? (
                        <div
                            className={cn(
                                "flex shrink-0 gap-3 border-t border-cream/[0.08] bg-panel",
                                isSheet
                                    ? "flex-col items-stretch px-4 pb-5 pt-3.5"
                                    : "flex-row items-center justify-between px-5 py-3.5",
                            )}
                        >
                            <div className="min-w-0">
                                {foot.label ? (
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                                        {foot.label}
                                    </p>
                                ) : null}
                                {foot.value !== undefined ? (
                                    <p
                                        className={cn(
                                            "truncate text-sm font-semibold",
                                            foot.danger && foot.primary.danger
                                                ? "text-accent-wine"
                                                : "text-foreground",
                                        )}
                                    >
                                        {foot.value}
                                    </p>
                                ) : null}
                            </div>
                            <div
                                className={cn(
                                    "flex gap-2.5",
                                    isSheet ? "flex-col" : "shrink-0 items-center",
                                )}
                            >
                                {foot.options ? (
                                    <button
                                        type="button"
                                        onClick={foot.options.onClick}
                                        className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-cream/[0.14] bg-cream/[0.04] px-[18px] text-[13.5px] font-semibold text-foreground transition hover:bg-cream/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                    >
                                        <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                                        {foot.options.label ?? "Options"}
                                    </button>
                                ) : null}
                                {foot.cancel ? (
                                    <button
                                        type="button"
                                        disabled={foot.cancel.disabled}
                                        onClick={
                                            foot.cancel.onClick === undefined
                                                ? () => {
                                                      resetTransientState();
                                                      stableClose();
                                                  }
                                                : foot.cancel.onClick
                                        }
                                        className={cn(
                                            "inline-flex min-h-[46px] items-center justify-center rounded-xl border border-cream/[0.14] bg-cream/[0.04] px-5 text-[13.5px] font-semibold text-foreground transition hover:bg-cream/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60",
                                            isSheet ? "w-full" : "",
                                        )}
                                    >
                                        {foot.cancel.label ?? "Cancel"}
                                    </button>
                                ) : null}
                                {primaryButton ? (
                                    <button
                                        type={primaryButton.type ?? "button"}
                                        disabled={primaryButton.disabled || primaryButton.pending}
                                        onClick={primaryButton.onClick}
                                        className={cn(
                                            "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-5 text-[13.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-70",
                                            primaryButton.danger
                                                ? "bg-accent-wine text-[rgb(26,14,16)] shadow-[0_12px_28px_-14px_rgba(198,106,118,0.5)] hover:brightness-110"
                                                : "bg-accent text-accent-foreground shadow-[0_12px_28px_-14px_rgba(232,165,80,0.55)] hover:brightness-110",
                                            isSheet ? "w-full" : "",
                                        )}
                                    >
                                        {primaryButton.pending ? "Working…" : primaryButton.label}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>,
        portalTarget,
    );
}

/** Pill button for pinned sub-bars (tabs, modes, season chips). */
export function DialogPill({
    active,
    onClick,
    children,
    className,
}: {
    active: boolean;
    onClick?: () => void;
    children: ReactNode;
    className?: string;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={cn(
                "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-[44px]",
                active
                    ? "border-accent/55 bg-accent/15 text-foreground"
                    : "border-cream/[0.08] bg-transparent text-muted hover:text-foreground",
                className,
            )}
        >
            {children}
        </button>
    );
}

/** Selectable row used inside dialog bodies (seasons, episodes, files). */
export function DialogRow({
    selected,
    locked,
    children,
    className,
}: {
    selected?: boolean;
    locked?: boolean;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex items-center gap-3 rounded-xl border px-3.5 text-[13.5px] transition-colors",
                locked
                    ? "border-cream/[0.08] bg-background/50 text-muted"
                    : selected
                      ? "border-accent/40 bg-accent/10 text-foreground"
                      : "border-cream/[0.08] bg-cream/[0.04] text-foreground",
                className,
            )}
        >
            {children}
        </div>
    );
}

/** Small status chip shown at the end of rows ("In library", "Monitored"). */
export function DialogRowChip({
    tone = "neutral",
    children,
}: {
    tone?: "neutral" | "cool" | "accent";
    children: ReactNode;
}) {
    return (
        <span
            className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                tone === "cool"
                    ? "border-accent-cool/35 bg-accent-cool/10 text-accent-cool"
                    : tone === "accent"
                      ? "border-accent/35 bg-accent/10 text-accent"
                      : "border-cream/[0.08] bg-cream/[0.03] text-muted",
            )}
        >
            {children}
        </span>
    );
}

/** Amber check icon for rows whose content is already complete/in library. */
export function DialogRowCheck() {
    return (
        <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-accent-cool"
        >
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}
