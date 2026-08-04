"use client";

import { type ReactNode, useCallback, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { usePortalTarget } from "@/components/ui/use-portal-target";

type LibraryTitleDialogShellProps = {
  labelledBy: string;
  closeHref: string;
  children: ReactNode;
};

export function LibraryTitleDialogShell({
  labelledBy,
  closeHref,
  children,
}: LibraryTitleDialogShellProps) {
  const router = useRouter();
  const [isClosing, setIsClosing] = useState(false);
  const portalTarget = usePortalTarget();
  const [, startTransition] = useTransition();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const closeDialog = useCallback(() => {
    setIsClosing(true);
    startTransition(() => {
      router.replace(closeHref, { scroll: false });
    });
  }, [closeHref, router]);

  const dialogRef = useModalDialog({
    onClose: closeDialog,
    initialFocusRef: closeButtonRef,
    enabled: portalTarget !== null && !isClosing,
  });

  if (isClosing || !portalTarget) {
    return null;
  }

  return createPortal(
    <div
      className="nk-scrim nk-fade fixed inset-0 z-[150] px-3 py-4 sm:px-6 sm:py-8"
      onClick={closeDialog}
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          tabIndex={-1}
          className="nk-pop relative flex h-[min(700px,90vh)] w-full max-w-[1040px] flex-col overflow-hidden rounded-[20px] border border-cream/[0.10] bg-[rgb(23,21,19)] shadow-[0_44px_90px_-44px_rgba(0,0,0,0.95)]"
          onClick={(event) => event.stopPropagation()}
        >
          {/* The redesign floats the close control over the work pane rather
              than giving it a chrome bar of its own. */}
          <button
            type="button"
            ref={closeButtonRef}
            aria-label="Close dialog"
            title="Close"
            onClick={closeDialog}
            className="absolute right-3 top-2.5 z-20 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-cream/[0.10] bg-cream/[0.03] text-muted transition hover:bg-cream/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X aria-hidden="true" size={16} />
          </button>
          {/* Panes manage their own scrolling so the identity rail and the work
              pane move independently. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">{children}</div>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
