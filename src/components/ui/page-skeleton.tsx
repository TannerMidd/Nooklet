import { cn } from "@/lib/utils";

type PageSkeletonProps = {
  rowCount?: number;
};

export function PageSkeleton({ rowCount = 3 }: PageSkeletonProps) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        <SkeletonBlock className="h-3 w-24 rounded-full" />
        <SkeletonBlock className="h-8 w-72 max-w-full rounded-2xl" />
        <SkeletonBlock className="h-4 w-96 max-w-full rounded-full" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: rowCount }).map((_, index) => (
          <div
            key={index}
            className="space-y-3 rounded-3xl border border-line/70 bg-panel-strong/50 p-5"
          >
            <SkeletonBlock className="h-3 w-20 rounded-full" />
            <SkeletonBlock className="h-5 w-1/2 rounded-full" />
            <div className="space-y-2 pt-2">
              <SkeletonBlock className="h-3 w-full rounded-full" />
              <SkeletonBlock className="h-3 w-11/12 rounded-full" />
              <SkeletonBlock className="h-3 w-9/12 rounded-full" />
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
        "animate-pulse bg-gradient-to-r from-panel-strong/80 via-line/40 to-panel-strong/80",
        className,
      )}
    />
  );
}
