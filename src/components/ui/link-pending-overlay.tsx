"use client";

import { useLinkStatus } from "next/link";

import { cn } from "@/lib/utils";

type LinkPendingOverlayProps = {
  className?: string;
};

/**
 * Renders a centered spinner + dim overlay while the parent Next.js `<Link>` is
 * pending navigation. Place inside `<Link>` as a sibling of the link's content.
 *
 * Requires the parent link to be `position: relative`.
 */
export function LinkPendingOverlay({ className }: LinkPendingOverlayProps) {
  const { pending } = useLinkStatus();

  if (!pending) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-[rgba(18,22,29,0.55)] backdrop-blur-[1px]",
        className,
      )}
    >
      <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </span>
  );
}
