import Image from "next/image";

type RecommendationPosterProps = {
  title: string;
  posterUrl?: string | null;
};

function buildPosterFallbackLabel(title: string) {
  return title
    .split(/\s+/)
    .filter((entry) => entry.length > 0)
    .slice(0, 2)
    .map((entry) => entry[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function RecommendationPoster({ title, posterUrl }: RecommendationPosterProps) {
  const fallbackLabel = buildPosterFallbackLabel(title);

  return (
    <div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-md border border-line/70 bg-panel-strong sm:w-28">
      {posterUrl ? (
        <Image
          src={posterUrl}
          alt={`${title} poster`}
          fill
          unoptimized
          sizes="(min-width: 640px) 7rem, 6rem"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col justify-between bg-[radial-gradient(circle_at_top,_rgb(var(--accent)/0.16),_transparent_60%),linear-gradient(180deg,_rgb(var(--panel-strong)/0.95),_rgb(var(--background)/0.98))] p-3 text-foreground">
          <span className="font-heading text-xl leading-none text-accent">{fallbackLabel}</span>
          <div className="space-y-1">
            <p className="font-heading text-xs italic text-muted">
              Poster
            </p>
            <p className="text-xs leading-5 text-muted">Available on new or refreshed lookups.</p>
          </div>
        </div>
      )}
    </div>
  );
}