import { safeFetch } from "@/lib/security/safe-fetch";
import { decryptSecret } from "@/lib/security/secret-box";
import {
  EnqueueNzbDownloadError,
  enqueueNzbDownloadWorkflow,
} from "@/modules/download-engine/workflows/enqueue-nzb-download";
import { applyEngineQueueAction } from "@/modules/download-engine/workflows/apply-engine-queue-action";
import { resolveUsenetServer } from "@/modules/download-engine/config/resolve-usenet-server";
import { parseNzb } from "@/modules/download-engine/nzb/parse-nzb";
import { releaseIsWhollyUnavailable } from "@/modules/download-engine/scheduler/release-availability";
import {
  detectNewznabErrorDocument,
  formatNewznabErrorDocument,
} from "@/modules/indexers/public";
import { findIndexerById } from "@/modules/indexers/public";

import { QueueIndexerResultWorkflowError } from "./errors";
import { type ResolvedQueueIndexerResult } from "./result-resolution";

export type QueueIndexerResultSubmission = {
  queueIds: string[];
  category: string;
};

const maxNzbBytes = 50 * 1024 * 1024;

function getDownloadCategory(result: ResolvedQueueIndexerResult) {
  return result.result.mediaType === "tv" ? ("tv" as const) : ("movies" as const);
}

/** Fetches the NZB document itself from the indexer's download URL. */
async function fetchNzbDocument(downloadUrl: string): Promise<string> {
  const response = await safeFetch(downloadUrl, {
    timeoutMs: 60_000,
    maxBytes: maxNzbBytes,
    headers: { Accept: "application/x-nzb, application/xml, text/xml, */*" },
  });

  if (!response.ok) {
    throw new QueueIndexerResultWorkflowError(
      // Only "this item is gone" is a statement about the release. Rate limits
      // (429) and server faults (5xx) are the indexer's, and must not cost the
      // release a durable exclusion.
      response.status === 404 || response.status === 410
        ? "release_unavailable"
        : "indexer_unavailable",
      `The indexer returned ${response.status} for the NZB download.`,
    );
  }

  const body = await response.text();
  // Newznab serves quota and credential errors as an <error> document with
  // HTTP 200. Left undetected it reaches parseNzb, fails there, and gets
  // recorded as `invalid_nzb` — blocklisting every candidate the user searched
  // for while their daily grab limit was spent.
  const indexerError = detectNewznabErrorDocument(body);

  if (indexerError) {
    throw new QueueIndexerResultWorkflowError(
      "indexer_unavailable",
      `The indexer refused the NZB download. ${formatNewznabErrorDocument(indexerError)}`,
    );
  }

  return body;
}

/**
 * Refuses a candidate whose articles are already gone, before it becomes a
 * download the user has to watch fail. `release_unavailable` is retryable, so
 * the caller simply moves to the next candidate.
 *
 * Indexers keep listing releases long after the posts behind them expire or
 * are removed, and popularity-ranked candidates surface exactly those first.
 * The check exits on the first article the server does have, so a healthy
 * release costs one round trip; only a dead one pays for the full sample.
 */
async function rejectWhollyUnavailableRelease(userId: string, nzbXml: string) {
  let resolvedServer: Awaited<ReturnType<typeof resolveUsenetServer>>;

  try {
    resolvedServer = await resolveUsenetServer(userId);
  } catch {
    // A server that cannot be resolved is the enqueue path's problem to
    // report, not a reason to reject the release here.
    return;
  }

  if (!resolvedServer) return;

  let nzb;

  try {
    nzb = parseNzb(nzbXml);
  } catch {
    // Let enqueueNzbDownloadWorkflow produce the canonical invalid-NZB error.
    return;
  }

  if (await releaseIsWhollyUnavailable({ nzb, server: resolvedServer.server })) {
    throw new QueueIndexerResultWorkflowError(
      "release_unavailable",
      "The news server no longer carries this release's articles.",
    );
  }
}

async function submitToEngine(
  resolvedResult: ResolvedQueueIndexerResult,
): Promise<QueueIndexerResultSubmission> {
  const category = getDownloadCategory(resolvedResult);

  try {
    const downloadUrl = decryptSecret(resolvedResult.secret.encryptedDownloadUrl);
    const indexer = resolvedResult.result.indexerId
      ? await findIndexerById(resolvedResult.result.userId, resolvedResult.result.indexerId)
      : null;

    if (!indexer) {
      throw new Error(
        "The indexer that supplied this release is no longer configured in Nooklet.",
      );
    }

    let downloadOrigin: string;
    let indexerOrigin: string;

    try {
      downloadOrigin = new URL(downloadUrl).origin;
      indexerOrigin = new URL(indexer.baseUrl).origin;
    } catch {
      throw new Error("The indexer returned an invalid NZB download URL.");
    }

    // Naming the two origins matters: this is an indexer/configuration fault
    // that a user can act on, and without them it is indistinguishable from a
    // dead release in the activity list.
    if (downloadOrigin !== indexerOrigin) {
      throw new Error(
        `The indexer returned an NZB URL from an unapproved host (${downloadOrigin} does not match the configured indexer at ${indexerOrigin}).`,
      );
    }

    const nzbXml = await fetchNzbDocument(downloadUrl);
    await rejectWhollyUnavailableRelease(resolvedResult.result.userId, nzbXml);
    const enqueued = await enqueueNzbDownloadWorkflow(resolvedResult.result.userId, {
      name: resolvedResult.result.title,
      category,
      nzbXml,
    });

    return { queueIds: [enqueued.id], category };
  } catch (error) {
    if (error instanceof QueueIndexerResultWorkflowError) {
      throw error;
    }

    if (error instanceof EnqueueNzbDownloadError) {
      throw new QueueIndexerResultWorkflowError(
        error.code === "invalid_nzb"
          ? "release_unavailable"
          : "download_capacity_exceeded",
        error.message,
        error.capacity,
      );
    }

    // Everything reaching here failed before the indexer gave us a usable
    // answer, so none of it is evidence about the release. Only the two
    // verdicts above are: an explicit 404/410 from the indexer, and an NZB
    // document that parsed as junk.
    //
    // This distinction is durable, not cosmetic. `release_unavailable` fails
    // the reservation, which leaves a download_requests row carrying the
    // search result id — the exact thing listFulfillmentReleaseExclusions
    // reads to exclude a release from every future search. `fetch` collapses
    // every socket, DNS and TLS failure into an opaque `TypeError`, so keying
    // off the error type let one reset connection permanently discard a
    // perfectly grabbable release and spend a candidate attempt doing it.
    // Defaulting the other way costs at most a retry.
    throw new QueueIndexerResultWorkflowError(
      "indexer_unavailable",
      error instanceof Error
        ? `Nooklet could not queue the selected release: ${error.message}`
        : "Nooklet could not queue the selected release.",
    );
  }
}

/** Best-effort rollback when enqueue succeeded but local persistence failed. */
export async function compensateIndexerResultSubmission(
  userId: string,
  submission: QueueIndexerResultSubmission,
) {
  const failures: unknown[] = [];

  for (const queueId of submission.queueIds) {
    try {
      await applyEngineQueueAction(userId, { type: "remove", itemId: queueId });
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "The submitted download could not be rolled back.");
  }
}

export async function submitIndexerResultToDownloadClient(
  resolvedResult: ResolvedQueueIndexerResult,
): Promise<QueueIndexerResultSubmission> {
  return submitToEngine(resolvedResult);
}
