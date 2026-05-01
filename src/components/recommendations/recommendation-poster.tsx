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
    <div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-md border border-line/60 bg-panel-strong shadow-[0_18px_34px_-28px_rgba(20,14,10,0.8)] sm:w-28">
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
        <div className="flex h-full w-full flex-col justify-between bg-[linear-gradient(180deg,_rgb(var(--panel-raised)/0.92),_rgb(var(--background)/0.98)),linear-gradient(90deg,_rgb(var(--accent)/0.14),_transparent_38%,_rgb(var(--accent-cool)/0.10))] p-3 text-foreground">
          <span className="font-heading text-2xl leading-none text-accent-strong">{fallbackLabel}</span>
          <span className="h-1 w-10 bg-accent/55" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}