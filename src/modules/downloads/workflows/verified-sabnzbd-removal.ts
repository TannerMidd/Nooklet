import {
  listSabnzbdHistory,
  listSabnzbdQueue,
  removeSabnzbdHistoryItem,
  removeSabnzbdQueueItem,
} from "@/lib/integrations/sabnzbd";

export type SabnzbdRemovalContext = {
  baseUrl: string;
  apiKey: string;
};

export type VerifiedSabnzbdRemoval = {
  removed: boolean;
  message?: string;
};

function failedResults(ids: string[], message: string) {
  return new Map(ids.map((id) => [
    id,
    { removed: false, message } satisfies VerifiedSabnzbdRemoval,
  ]));
}

async function queueIds(
  context: SabnzbdRemovalContext,
  targetIds: string[],
  beforeExternalPhase: () => Promise<void>,
) {
  const targets = new Set(targetIds);
  const found = new Set<string>();
  const pageSize = 100;
  let start = 0;
  let reportedTotal = Number.POSITIVE_INFINITY;

  while (start < reportedTotal && found.size < targets.size) {
    await beforeExternalPhase();
    const page = await listSabnzbdQueue({
      ...context,
      limit: pageSize,
      start,
    });
    reportedTotal = Math.max(
      Number.isFinite(reportedTotal) ? reportedTotal : 0,
      page.totalQueueCount,
    );
    for (const item of page.items) {
      if (targets.has(item.id)) found.add(item.id);
    }
    if (page.items.length === 0) break;
    start += page.items.length;
  }

  return found;
}

async function historyIds(
  context: SabnzbdRemovalContext,
  targetIds: string[],
  beforeExternalPhase: () => Promise<void>,
) {
  await beforeExternalPhase();
  const history = await listSabnzbdHistory({
    ...context,
    limit: Math.max(1, targetIds.length),
    nzoIds: targetIds,
  });
  return new Set(history.items.map((item) => item.id));
}

/**
 * Deletes queue/history records with their files, then verifies both SAB
 * surfaces. A boolean action response is not authoritative because SAB may
 * report success while an item remains visible.
 */
export async function removeAndVerifySabnzbdItems(
  context: SabnzbdRemovalContext,
  externalQueueIds: string[],
  options: {
    beforeExternalPhase?: () => Promise<void>;
  } = {},
): Promise<Map<string, VerifiedSabnzbdRemoval>> {
  const uniqueIds = Array.from(new Set(externalQueueIds));
  if (uniqueIds.length === 0) return new Map();
  const beforeExternalPhase = options.beforeExternalPhase ?? (async () => undefined);

  const readSurfaces = async () => {
    const active = await queueIds(context, uniqueIds, beforeExternalPhase);
    const history = await historyIds(context, uniqueIds, beforeExternalPhase);
    return { active, history };
  };
  const removePresent = async (snapshot: { active: Set<string>; history: Set<string> }) => {
    for (const id of uniqueIds) {
      if (snapshot.active.has(id)) {
        await beforeExternalPhase();
        await removeSabnzbdQueueItem({ ...context, itemId: id }).catch(() => undefined);
      }
      if (snapshot.history.has(id)) {
        await beforeExternalPhase();
        await removeSabnzbdHistoryItem({ ...context, itemId: id }).catch(() => undefined);
      }
    }
  };

  let observed;
  try {
    observed = await readSurfaces();
    await removePresent(observed);
    observed = await readSurfaces();
    await removePresent(observed);
    observed = await readSurfaces();
  } catch (error) {
    const message = error instanceof Error
      ? `SABnzbd removal could not be verified yet: ${error.message}`
      : "SABnzbd removal could not be verified yet.";
    return failedResults(uniqueIds, message);
  }

  return new Map<string, VerifiedSabnzbdRemoval>(uniqueIds.map((id) => {
    if (observed.active.has(id)) {
      return [id, {
        removed: false,
        message: "SABnzbd still reports the download as active; removal will retry automatically.",
      }] as const;
    }
    if (observed.history.has(id)) {
      return [id, {
        removed: false,
        message: "SABnzbd still reports completed or partial files; cleanup will retry automatically.",
      }] as const;
    }
    return [id, { removed: true }] as const;
  }));
}
