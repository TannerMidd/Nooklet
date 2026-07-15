import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <section className="max-w-lg text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">404</p>
        <h1 className="mt-2 font-heading text-4xl text-foreground">That nook is empty.</h1>
        <p className="mt-3 text-sm leading-6 text-muted">The page may have moved, or the link is no longer valid.</p>
        <Link
          href="/"
          className="nk-button-primary mt-6 inline-flex min-h-11 items-center rounded-lg px-5 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Go home
        </Link>
      </section>
    </main>
  );
}
