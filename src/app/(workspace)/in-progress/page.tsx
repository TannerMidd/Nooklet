import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getActiveDownloadQueue } from "@/modules/download-engine/queries/get-active-download-queue";
import {
  ActivityAutoRefresh,
  DownloadActivityPanel,
  ImportNowButton,
} from "@/app/(workspace)/in-progress/download-activity-panel";
import { DownloadQueuePanel } from "@/components/recommendations/download-queue-panel";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedLinks } from "@/components/ui/segmented-control";
import {
  getDownloadActivityPage,
  type DownloadActivityView,
} from "@/modules/downloads/queries/list-download-activity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Activity" };

type ActivityPageProps = {
  searchParams?: Promise<{ view?: string; q?: string; page?: string }>;
};

function activityHref(view: DownloadActivityView, query: string, page = 1) {
  const params = new URLSearchParams({ view });
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  return `/in-progress?${params.toString()}`;
}

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const resolvedSearchParams = await searchParams;
  const requestedView = resolvedSearchParams?.view;
  const currentView: DownloadActivityView = requestedView === "active" || requestedView === "attention" || requestedView === "completed"
    ? requestedView
    : "active";
  const requestedPage = Number.parseInt(resolvedSearchParams?.page ?? "1", 10);
  const [activeQueue, activity] = await Promise.all([
    getActiveDownloadQueue(session.user.id),
    getDownloadActivityPage({
      userId: session.user.id,
      view: currentView,
      query: resolvedSearchParams?.q,
      page: Number.isFinite(requestedPage) ? requestedPage : 1,
    }),
  ]);
  if (!requestedView && activity.counts.active === 0) {
    if (activity.counts.attention > 0) redirect(activityHref("attention", activity.query));
    if (activity.counts.completed > 0) redirect(activityHref("completed", activity.query));
  }
  const views = [
    { value: "active", label: "Active", count: activity.counts.active },
    { value: "attention", label: "Needs attention", count: activity.counts.attention },
    { value: "completed", label: "Completed", count: activity.counts.completed },
  ] as const;

  return (
    <div className="nk-enter space-y-8">
      <ActivityAutoRefresh />
      <PageHeader
        eyebrow="Live · refreshes every 15 seconds"
        title="Activity"
        description="Track active work, resolve problems with the right recovery action, and review completed imports."
        actions={<ImportNowButton />}
      />

      <SegmentedLinks
        label="Activity views"
        className="max-w-full flex-wrap"
        options={views.map((view) => ({
          key: view.value,
          href: activityHref(view.value, activity.query),
          active: currentView === view.value,
          label: (
            <>
              {view.label}
              <span className={currentView === view.value ? "text-accent-foreground/75" : "text-muted"}>
                {view.count}
              </span>
            </>
          ),
        }))}
      />

      <form action="/in-progress" className="flex max-w-xl flex-col gap-2 sm:flex-row">
        <input type="hidden" name="view" value={currentView} />
        <label className="sr-only" htmlFor="activity-search">Search request history</label>
        <input
          id="activity-search"
          name="q"
          defaultValue={activity.query}
          placeholder="Search requested or release title"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-cream/[0.10] bg-cream/[0.04] px-4 text-sm text-foreground outline-none placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus/30"
        />
        <button type="submit" className="min-h-11 rounded-lg border border-cream/[0.14] px-5 text-sm font-semibold text-foreground hover:bg-cream/[0.06]">Search history</button>
      </form>

      {currentView === "active" ? <DownloadQueuePanel initialState={activeQueue} /> : null}

      <section className="space-y-4">
        <h2 className="font-heading text-2xl text-foreground">
          {currentView === "active"
            ? "Active downloads and season plans"
            : currentView === "attention"
              ? "Items needing attention"
              : "Recently completed items"}
        </h2>
        <DownloadActivityPanel entries={activity.entries} />
        {activity.pagination.pageCount > 1 ? (
          <nav aria-label="Activity history pages" className="flex items-center justify-between gap-3 pt-2 text-sm">
            {activity.pagination.hasPreviousPage ? (
              <Link href={activityHref(currentView, activity.query, activity.pagination.page - 1)} className="inline-flex min-h-11 items-center rounded-lg border border-cream/[0.14] px-4 font-semibold text-foreground">Previous</Link>
            ) : <span />}
            <span className="text-muted">Page {activity.pagination.page} of {activity.pagination.pageCount} · {activity.pagination.total} items</span>
            {activity.pagination.hasNextPage ? (
              <Link href={activityHref(currentView, activity.query, activity.pagination.page + 1)} className="inline-flex min-h-11 items-center rounded-lg border border-cream/[0.14] px-4 font-semibold text-foreground">Next</Link>
            ) : <span />}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
