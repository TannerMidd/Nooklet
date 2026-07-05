import { statusTone } from "@/components/ui/status-tone";
import { type listRecommendationItemTimeline } from "@/modules/recommendations/queries/list-recommendation-item-timeline";

type RecommendationTimelineEvent = Awaited<ReturnType<typeof listRecommendationItemTimeline>>[number];

type RecommendationTimelineProps = {
  events: RecommendationTimelineEvent[];
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function RecommendationTimeline({ events }: RecommendationTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-line/70 bg-panel-strong/70 px-3 py-2.5 text-sm leading-6 text-muted">
        No timeline events have been recorded for this title yet.
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li
          key={event.id}
          className={`rounded-lg border px-3 py-2.5 text-sm leading-6 ${statusTone(event.status)}`}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium text-foreground">{event.title}</p>
              <p className="mt-1 text-muted">{event.message}</p>
            </div>
            <p className="shrink-0 text-xs font-medium text-muted">
              {formatDate(event.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}