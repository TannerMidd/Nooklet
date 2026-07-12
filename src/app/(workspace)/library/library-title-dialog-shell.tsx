"use client";

import { type ReactNode, useCallback, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

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
  const [, startTransition] = useTransition();

  const closeDialog = useCallback(() => {
    setIsClosing(true);
    startTransition(() => {
      router.push(closeHref, { scroll: false });
    });
  }, [closeHref, router]);

  useEffect(() => {
    if (isClosing) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDialog();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDialog, isClosing]);

  if (isClosing || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[150] bg-background/85 px-3 py-4 sm:px-6 sm:py-8"
      onClick={closeDialog}
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-cream/[0.08] bg-panel shadow-[0_28px_70px_-42px_rgba(0,0,0,0.75)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex justify-end border-b border-cream/[0.08] px-4 py-3 sm:px-6">
            <button
              type="button"
              aria-label="Close dialog"
              title="Close"
              onClick={closeDialog}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-cream/[0.08] bg-cream/[0.04] text-muted transition hover:bg-cream/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
