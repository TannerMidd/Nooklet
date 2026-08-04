"use client";

import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { type ReactNode, useCallback } from "react";

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

export function Drawer({ open, onClose, title, children, id, side = "right", className }: DrawerProps) {
  const portalTarget = usePortalTarget();
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
        onClick={onClose}
        className="absolute inset-0 h-full w-full nk-scrim nk-fade"
      />
      <aside
        ref={dialogRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 flex w-[min(88vw,22rem)] flex-col border-cream/[0.10] bg-[rgb(23,21,19)] shadow-[0_44px_90px_-44px_rgba(0,0,0,0.95)] focus:outline-none",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          className,
        )}
      >
        <div className="flex min-h-16 items-center justify-between gap-3 border-b border-cream/[0.07] px-5">
          <h2 className="font-heading text-[21px] text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-cream/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    portalTarget,
  );
}
