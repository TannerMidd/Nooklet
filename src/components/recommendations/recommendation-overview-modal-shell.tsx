"use client";

import { type ReactNode, useCallback, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

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
  const [, startTransition] = useTransition();

  const closeModal = useCallback(() => {
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
        closeModal();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeModal, isClosing]);

  if (isClosing || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[130] bg-background/80 px-4 py-6 backdrop-blur-md md:px-8 md:py-10"
      onClick={closeModal}
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="flex max-h-[min(90vh,62rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[36px] border border-line/80 bg-panel shadow-soft"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex justify-end border-b border-line/70 px-5 py-4 md:px-8">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Close
            </Button>
          </div>
          <div className="overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}