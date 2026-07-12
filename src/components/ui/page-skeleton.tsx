import { cn } from "@/lib/utils";

type PageSkeletonProps = {
  rowCount?: number;
};

export function PageSkeleton({ rowCount = 3 }: PageSkeletonProps) {
  return (
    <div className="space-y-7" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        <SkeletonBlock className="h-3 w-24 rounded-md" />
        <SkeletonBlock className="h-9 w-64 max-w-full rounded-lg" />
        <SkeletonBlock className="h-4 w-96 max-w-full rounded-md" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: rowCount }).map((_, index) => (
          <div
            key={index}
            className="space-y-3 rounded-2xl border border-cream/[0.08] bg-cream/[0.03] p-5"
          >
            <SkeletonBlock className="h-3 w-20 rounded-md" />
            <SkeletonBlock className="h-5 w-1/2 rounded-md" />
            <div className="space-y-2 pt-2">
              <SkeletonBlock className="h-3 w-full rounded-md" />
              <SkeletonBlock className="h-3 w-11/12 rounded-md" />
              <SkeletonBlock className="h-3 w-9/12 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse bg-gradient-to-r from-cream/[0.05] via-cream/10 to-cream/[0.05]",
        className,
      )}
    />
  );
}
