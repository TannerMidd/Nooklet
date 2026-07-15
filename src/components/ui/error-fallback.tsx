"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type ErrorFallbackProps = {
  error: Error & { digest?: string };
  reset: () => void;
  fullPage?: boolean;
};

export function ErrorFallback({ error, reset, fullPage = false }: ErrorFallbackProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    console.error("[ui] route rendering failed", error);
    headingRef.current?.focus();
  }, [error]);

  const content = (
    <section
      aria-labelledby="route-error-title"
      aria-describedby="route-error-description"
      role="alert"
      className="mx-auto max-w-lg rounded-2xl border border-accent-wine/30 bg-panel p-7 text-center"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-wine">Something went wrong</p>
      <h1
        ref={headingRef}
        id="route-error-title"
        tabIndex={-1}
        className="mt-2 font-heading text-3xl text-foreground focus:outline-none"
      >
        Nooklet could not load this page.
      </h1>
      <p id="route-error-description" className="mt-3 text-sm leading-6 text-muted">
        Try the request again. If it keeps failing, check the Health page and server logs.
      </p>
      {error.digest ? <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={reset}>Try again</Button>
        <Link
          href="/home"
          className="inline-flex min-h-11 items-center rounded-lg border border-control bg-cream/[0.04] px-5 py-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Go home
        </Link>
      </div>
    </section>
  );

  // Workspace errors already live inside AppShell's main landmark.
  return fullPage ? (
    <main className="flex min-h-screen items-center justify-center px-4">{content}</main>
  ) : (
    <div className="py-16">{content}</div>
  );
}
