"use client";

import { type ReactNode, useCallback, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { usePortalTarget } from "@/components/ui/use-portal-target";

type RecommendationOverviewModalShellProps = {
  titleId: string;
  closeHref: string;
  children: ReactNode;
};

export function RecommendationOverviewModalShell({
  titleId,
  closeHref,
  children,
}: RecommendationOverviewModalShellProps) {
  const router = useRouter();
  // Hide the modal optimistically while the URL transition runs in the
  // background. Without this the dialog stays mounted until the parent
  // server component re-renders, which is the source of the noticeable
  // close lag on `force-dynamic` pages like /history and /discover.
  const [isClosing, setIsClosing] = useState(false);
  const portalTarget = usePortalTarget();
  const [, startTransition] = useTransition();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const closeModal = useCallback(() => {
    setIsClosing(true);
    startTransition(() => {
      router.replace(closeHref, { scroll: false });
    });
  }, [closeHref, router]);

  const dialogRef = useModalDialog({
    onClose: closeModal,
    initialFocusRef: closeButtonRef,
    enabled: portalTarget !== null && !isClosing,
  });

  if (isClosing || !portalTarget) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[130] bg-background/85 px-4 py-6 md:px-8 md:py-10"
      onClick={closeModal}
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="flex max-h-[min(90vh,62rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-cream/[0.08] bg-panel"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex justify-end border-b border-cream/[0.08] px-5 py-4 md:px-8">
            <Button ref={closeButtonRef} type="button" variant="secondary" onClick={closeModal}>
              Close
            </Button>
          </div>
          <div className="overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
