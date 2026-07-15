import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-xl bg-cream/[0.06]", className)} />;
}

export function PageSkeleton({ cards = 4, rows = 3 }: { cards?: number; rows?: number }) {
  return (
    <div role="status" aria-label="Loading page" className="space-y-8">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        <Block className="h-3 w-28" />
        <Block className="h-11 w-full max-w-md" />
        <Block className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: cards }, (_, index) => <Block key={index} className="h-24" />)}
      </div>
      <div className="space-y-3 rounded-2xl border border-line p-4 sm:p-5">
        {Array.from({ length: rows }, (_, index) => <Block key={index} className="h-20" />)}
      </div>
    </div>
  );
}
