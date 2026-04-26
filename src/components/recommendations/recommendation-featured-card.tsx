import { type CSSProperties } from "react";
import Link from "next/link";

import { RecommendationAddForm } from "@/components/recommendations/recommendation-add-form";
import { RecommendationFeedbackActions } from "@/components/recommendations/recommendation-feedback-actions";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { type RecommendationMediaType, type RecommendationFeedbackValue } from "@/lib/database/schema";
import { type RecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

const rationaleClampStyle: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 4,
  overflow: "hidden",
};

type RecommendationFeaturedCardProps = {
  itemId: string;
  mediaType: RecommendationMediaType;
  title: string;
  year: number | null;
  rationale: string;
  confidenceLabel?: string | null;
  feedback?: RecommendationFeedbackValue | null;
  existingInLibrary?: boolean;
  providerMetadata?: RecommendationProviderMetadata | null;
  routePath: "/tv" | "/movies";
  libraryConnection: ServiceConnectionSummary | null;
  savedRootFolderPath?: string | null;
  savedQualityProfileId?: number | null;
  overviewHref?: string;
  animationDelayMs?: number;
};

function formatConfidenceLabel(value: string) {
  return value.trim().toUpperCase();
}

export function RecommendationFeaturedCard({
  itemId,
  mediaType,
  title,
  year,
  rationale,
  confidenceLabel,
  feedback,
  existingInLibrary,
  providerMetadata,
  routePath,
  libraryConnection,
  savedRootFolderPath,
  savedQualityProfileId,
  overviewHref,
  animationDelayMs = 0,
}: RecommendationFeaturedCardProps) {
  const resolvedOverviewHref = overviewHref ?? `/recommendations/${itemId}?returnTo=${encodeURIComponent(routePath)}`;

  return (
    <article
      className="recommendation-featured-card flex h-full flex-col rounded-[30px] border border-line/70 bg-[linear-gradient(180deg,rgba(33,39,49,0.96),rgba(24,29,37,0.98))] p-5 shadow-soft"
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <Link
        href={resolvedOverviewHref}
        scroll={false}
        className="block space-y-5 rounded-[24px] outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <div className="grid gap-4 sm:grid-cols-[6.25rem_minmax(0,1fr)] sm:items-start">
          <div className="mx-auto sm:mx-0">
            <RecommendationPoster title={title} posterUrl={providerMetadata?.posterUrl} />
          </div>

          <div className="min-w-0 space-y-3 sm:pt-1">
            <div className="flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted">
              {confidenceLabel ? (
                <span className="rounded-full border border-line/70 bg-panel-strong/70 px-3 py-1.5 text-foreground">
                  {formatConfidenceLabel(confidenceLabel)}
                </span>
              ) : null}
              {existingInLibrary ? (
                <span className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-foreground">
                  Existing in library
                </span>
              ) : null}
              {year ? <span className="px-1 py-1.5">{year}</span> : null}
            </div>

            <h3 className="text-[1.35rem] font-semibold leading-tight text-foreground sm:text-[1.5rem]">
              {title}
            </h3>
          </div>
        </div>

        <p className="min-h-[7.5rem] text-sm leading-7 text-muted" style={rationaleClampStyle}>
          {rationale}
        </p>
      </Link>

      <div className="mt-auto pt-5">
        <div className="flex flex-col gap-3 border-t border-line/70 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <RecommendationFeedbackActions
              itemId={itemId}
              feedback={feedback}
              returnTo={routePath}
              buttonClassName="min-h-10 rounded-full px-4 py-2"
            />
          </div>

          <RecommendationAddForm
            itemId={itemId}
            mediaType={mediaType}
            existingInLibrary={existingInLibrary}
            returnTo={routePath}
            connectionSummary={libraryConnection}
            providerMetadata={providerMetadata}
            savedRootFolderPath={savedRootFolderPath}
            savedQualityProfileId={savedQualityProfileId}
            variant="compact"
            buttonClassName="min-h-10 rounded-full px-4 py-2 whitespace-nowrap"
          />
        </div>
      </div>
    </article>
  );
}