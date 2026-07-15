import Image from "next/image";

import { cn } from "@/lib/utils";

type RecommendationPosterProps = {
  title: string;
  posterUrl?: string | null;
  className?: string;
  /** Posters are decorative by default because visible adjacent text names the title. */
  informative?: boolean;
};

const posterHues = [
  "nk-poster-amber",
  "nk-poster-teal",
  "nk-poster-wine",
  "nk-poster-slate",
  "nk-poster-moss",
] as const;

function posterHueForTitle(title: string) {
  let hash = 0;
  for (let index = 0; index < title.length; index += 1) {
    hash = (hash * 31 + title.charCodeAt(index)) | 0;
  }
  return posterHues[Math.abs(hash) % posterHues.length];
}

function buildPosterFallbackLabel(title: string) {
  return title.trim()[0]?.toUpperCase() ?? "?";
}

export function RecommendationPoster({ title, posterUrl, className, informative = false }: RecommendationPosterProps) {
  return (
    <div
      className={cn(
        "relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-md border border-cream/10 shadow-[0_18px_34px_-24px_rgba(0,0,0,0.8)] sm:w-28",
        className,
      )}
    >
      {posterUrl ? (
        <Image
          src={posterUrl}
          alt={informative ? `${title} poster` : ""}
          fill
          unoptimized
          sizes="(min-width: 640px) 7rem, 6rem"
          className="object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className={cn(
            "flex h-full w-full items-end p-3",
            posterHueForTitle(title),
          )}
        >
          <span className="font-heading text-3xl italic leading-none text-cream/85">
            {buildPosterFallbackLabel(title)}
          </span>
        </div>
      )}
    </div>
  );
}
