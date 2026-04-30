"use client";

import { Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { type TmdbVideo } from "@/modules/service-connections/adapters/tmdb";

type RecommendationTrailerSectionProps = {
  videos: TmdbVideo[];
  title: string;
};

function buildEmbedSrc(key: string) {
  // youtube-nocookie keeps tracking off until the user actually plays the video.
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(key)}?autoplay=1&rel=0`;
}

function buildWatchUrl(key: string) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(key)}`;
}

function buildThumbnailUrl(key: string) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(key)}/hqdefault.jpg`;
}

export function RecommendationTrailerSection({ videos, title }: RecommendationTrailerSectionProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  if (videos.length === 0) {
    return null;
  }

  const featuredVideo = videos[0]!;
  const otherVideos = videos.slice(1);

  return (
    <section className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">Trailers and clips</p>

      <div className="overflow-hidden rounded-2xl border border-line/70 bg-panel-strong/70">
        {activeKey ? (
          <div className="relative aspect-video w-full bg-black">
            <iframe
              src={buildEmbedSrc(activeKey)}
              title={`${featuredVideo.name || title} player`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setActiveKey(featuredVideo.key)}
            className="group relative flex aspect-video w-full items-center justify-center overflow-hidden bg-black/60 text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail served from i.ytimg.com without remote-image config. */}
            <img
              src={buildThumbnailUrl(featuredVideo.key)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
            />
            <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,22,29,0.1),rgba(18,22,29,0.7))]" />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-foreground">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-background shadow-soft">
                <Play className="h-7 w-7" aria-hidden="true" />
              </span>
              <span className="px-4 text-center text-sm font-medium leading-6 text-foreground">
                {featuredVideo.name || `Watch ${title} trailer`}
              </span>
            </span>
            <span className="sr-only">Play trailer</span>
          </button>
        )}
      </div>

      {otherVideos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {videos.map((video) => (
            <Button
              key={video.key}
              type="button"
              variant={activeKey === video.key ? "primary" : "secondary"}
              onClick={() => setActiveKey(video.key)}
              className="text-xs"
            >
              {video.type}
              {video.official ? " (official)" : ""}
              {video.name ? ` — ${video.name}` : ""}
            </Button>
          ))}
        </div>
      ) : null}

      <p className="text-xs leading-5 text-muted">
        Videos hosted on YouTube. Press play to load the embed, or{" "}
        <a
          href={buildWatchUrl(featuredVideo.key)}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent hover:underline"
        >
          open on YouTube
        </a>
        .
      </p>
    </section>
  );
}
