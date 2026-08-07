import { type CSSProperties } from "react";
import Link from "next/link";

import { RecommendationAddForm } from "@/components/recommendations/recommendation-add-form";
import { RecommendationFeedbackActions } from "@/components/recommendations/recommendation-feedback-actions";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { RecommendationDownloadStatus } from "@/components/recommendations/recommendation-download-status";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import {
    type RecommendationMediaType,
    type RecommendationFeedbackValue,
} from "@/lib/database/schema";
import { type RecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { cn } from "@/lib/utils";
import {
    type LibraryOption,
    type QualityProfileOption,
} from "@/components/media-library/title-request-controls";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";

const rationaleClampStyle: CSSProperties = {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
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
    overviewHref?: string;
    animationDelayMs?: number;
    libraries: LibraryOption[];
    qualityProfiles: readonly QualityProfileOption[];
    pathOptions: MediaLibraryPathOption[];
};

function isHighConfidence(value: string | null | undefined) {
    return Boolean(value && value.trim().toLowerCase().startsWith("high"));
}

function formatConfidenceLabel(value: string | null | undefined) {
    if (!value) {
        return null;
    }

    return isHighConfidence(value)
        ? "High confidence"
        : value
              .trim()
              .replace(/confidence/i, "")
              .trim() || value.trim();
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
    overviewHref,
    animationDelayMs = 0,
    libraries,
    qualityProfiles,
    pathOptions,
}: RecommendationFeaturedCardProps) {
    const resolvedOverviewHref =
        overviewHref ?? `/recommendations/${itemId}?returnTo=${encodeURIComponent(routePath)}`;
    const confidence = formatConfidenceLabel(confidenceLabel);

    return (
        <article
            className="recommendation-featured-card flex h-full flex-col rounded-2xl border border-cream/[0.08] bg-cream/[0.03] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-cream/[0.14] hover:bg-cream/[0.05]"
            style={{ animationDelay: `${animationDelayMs}ms` }}
        >
            <Link
                href={resolvedOverviewHref}
                scroll={false}
                className="relative block outline-none transition hover:opacity-95 focus-visible:rounded-lg focus-visible:ring-1 focus-visible:ring-accent/50"
            >
                <LinkPendingOverlay className="rounded-lg" />
                <div className="flex gap-4">
                    <RecommendationPoster
                        title={title}
                        posterUrl={providerMetadata?.posterUrl}
                        className="w-[84px] rounded-md sm:w-[84px]"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                            {confidence ? (
                                <span className="inline-flex items-center gap-1.5">
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            "h-[7px] w-[7px] rounded-full",
                                            isHighConfidence(confidenceLabel)
                                                ? "bg-accent-cool"
                                                : "bg-muted",
                                        )}
                                    />
                                    {confidence}
                                </span>
                            ) : null}
                            {year ? (
                                <>
                                    <span aria-hidden="true">·</span>
                                    <span>{year}</span>
                                </>
                            ) : null}
                        </div>
                        <h3 className="text-[17px] font-semibold leading-tight text-foreground">
                            {title}
                        </h3>
                        <p className="text-[13px] leading-5 text-muted" style={rationaleClampStyle}>
                            {rationale}
                        </p>
                    </div>
                </div>
            </Link>

            <RecommendationDownloadStatus
                title={title}
                year={year}
                mediaType={mediaType}
                providerMetadata={providerMetadata}
                className="mt-3"
            />

            <div className="mt-auto pt-4">
                <div className="flex flex-wrap items-center gap-2">
                    <RecommendationAddForm
                        itemId={itemId}
                        existingInLibrary={existingInLibrary}
                        returnTo={routePath}
                        variant="compact"
                        buttonClassName="min-h-11 rounded-full border border-accent/45 bg-transparent px-4 text-xs font-semibold text-accent shadow-none hover:bg-accent/[0.14]"
                        mediaType={mediaType}
                        tmdbId={
                            providerMetadata?.tmdbDetails?.mediaType === mediaType
                                ? (providerMetadata.tmdbDetails.tmdbId ?? null)
                                : null
                        }
                        titleLabel={`${title}${year ? ` (${year})` : ""}`}
                        libraries={libraries}
                        qualityProfiles={qualityProfiles}
                        pathOptions={pathOptions}
                    />
                    <RecommendationFeedbackActions
                        itemId={itemId}
                        feedback={feedback}
                        returnTo={routePath}
                    />
                </div>
            </div>
        </article>
    );
}
