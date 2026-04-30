import { type CSSProperties } from "react";
import Link from "next/link";

import { RecommendationAddForm } from "@/components/recommendations/recommendation-add-form";
import { RecommendationFeedbackActions } from "@/components/recommendations/recommendation-feedback-actions";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { RecommendationSabnzbdStatus } from "@/components/recommendations/recommendation-sabnzbd-status";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
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
      className="recommendation-featured-card flex h-full flex-col rounded-xl border border-line/70 bg-panel p-5"
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <Link
        href={resolvedOverviewHref}
        scroll={false}
        className="relative block space-y-5 rounded-lg outline-none transition hover:opacity-90 focus-visible:ring-1 focus-visible:ring-accent/50"
      >
        <LinkPendingOverlay className="rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-[6.25rem_minmax(0,1fr)] sm:items-start">
          <div className="mx-auto sm:mx-0">
            <RecommendationPoster title={title} posterUrl={providerMetadata?.posterUrl} />
          </div>

          <div className="min-w-0 space-y-3 sm:pt-1">
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              {confidenceLabel ? (
                <span className="rounded-md border border-line/70 bg-panel-strong/70 px-3 py-1.5 font-medium text-foreground">
                  {formatConfidenceLabel(confidenceLabel)}
                </span>
              ) : null}
              {existingInLibrary ? (
                <span className="rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 font-medium text-foreground">
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

      <RecommendationSabnzbdStatus
        title={title}
        year={year}
        mediaType={mediaType}
        providerMetadata={providerMetadata}
        className="mt-4"
      />

      <div className="mt-auto pt-5">
        <div className="flex flex-col gap-3 border-t border-line/70 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <RecommendationFeedbackActions
              itemId={itemId}
              feedback={feedback}
              returnTo={routePath}
              buttonClassName="h-10 min-h-10 w-10 rounded-full"
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