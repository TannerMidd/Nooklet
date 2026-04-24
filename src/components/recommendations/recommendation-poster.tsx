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
    <div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-[22px] border border-line/70 bg-panel-strong/80 shadow-soft sm:w-28">
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={`${title} poster`}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col justify-between bg-[radial-gradient(circle_at_top,_rgba(181,154,106,0.24),_transparent_58%),linear-gradient(180deg,_rgba(42,50,63,0.95),_rgba(18,22,29,0.98))] p-3 text-foreground">
          <span className="font-heading text-xl leading-none text-accent">{fallbackLabel}</span>
          <div className="space-y-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted">
              Poster
            </p>
            <p className="text-xs leading-5 text-muted">Available on new or refreshed lookups.</p>
          </div>
        </div>
      )}
    </div>
  );
}