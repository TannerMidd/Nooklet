import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RecommendationEpisodePicker } from "@/components/recommendations/recommendation-episode-picker";
import { submitRecommendationEpisodeSelectionAction } from "@/app/(workspace)/recommendation-episode-actions";
import { Panel } from "@/components/ui/panel";
import { parseRecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { findRecommendationItemForUser } from "@/modules/recommendations/queries/find-recommendation-item-for-user";
import { listSonarrSeriesEpisodesForUser } from "@/modules/service-connections/workflows/list-sonarr-series-episodes-for-user";

export const dynamic = "force-dynamic";

type SonarrEpisodesPageProps = {
  params: Promise<{ itemId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
};

export default async function SonarrEpisodesPage({
  params,
  searchParams,
}: SonarrEpisodesPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { itemId } = await params;
  const resolvedSearchParams = await searchParams;
  const item = await findRecommendationItemForUser(session.user.id, itemId);

  if (!item || item.mediaType !== "tv") {
    redirect("/history");
  }

  const itemMetadata = parseRecommendationProviderMetadata(item.providerMetadataJson);

  if (!itemMetadata?.pendingEpisodeSelection || !itemMetadata.sonarrSeriesId) {
    redirect("/history");
  }

  const returnTo =
    resolvedSearchParams?.returnTo && resolvedSearchParams.returnTo.startsWith("/")
      ? resolvedSearchParams.returnTo
      : itemMetadata.pendingEpisodeReturnTo ?? "/history";

  const episodesResult = await listSonarrSeriesEpisodesForUser(
    session.user.id,
    itemMetadata.sonarrSeriesId,
  );

  if (!episodesResult.ok && episodesResult.reason !== "request-failed") {
    return (
      <div className="space-y-5">
        <Panel
          eyebrow="Sonarr"
          title={`Choose episodes for ${item.title}`}
          description="Sonarr verification is required before episodes can be loaded."
        >
          <p className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight">
            {episodesResult.message}
          </p>
          <div className="mt-4">
            <Link
              href="/settings/connections"
              className="text-sm font-medium text-accent hover:underline"
            >
              Open Sonarr settings
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Panel
        eyebrow="Sonarr"
        title={`Choose episodes for ${item.title}${item.year ? ` (${item.year})` : ""}`}
        description="The series was added to Sonarr without monitoring. Pick the episodes you want monitored and Sonarr will queue searches for them."
      >
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={returnTo} className="text-muted hover:text-foreground">
            Cancel and return
          </Link>
        </div>
      </Panel>

      {episodesResult.ok ? (
        episodesResult.episodes.length > 0 ? (
          <RecommendationEpisodePicker
            episodes={episodesResult.episodes}
            action={submitRecommendationEpisodeSelectionAction}
            hiddenFields={[
              { name: "itemId", value: item.itemId },
              { name: "returnTo", value: returnTo },
            ]}
          />
        ) : (
          <Panel title="No episodes returned">
            <p className="text-sm leading-6 text-muted">
              Sonarr has not returned any episodes for this series yet. Wait a moment for the metadata
              refresh to finish, then reload this page.
            </p>
          </Panel>
        )
      ) : (
        <Panel title="Failed to load episodes">
          <p className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight">
            {episodesResult.message}
          </p>
        </Panel>
      )}
    </div>
  );
}
