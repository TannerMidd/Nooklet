import { type default as Database } from "better-sqlite3";

const activeRequestStatuses = [
  "pending",
  "queued",
  "downloading",
  "importing",
  "requeuing",
] as const;
const activeQueueStatuses = ["queued", "downloading", "paused"] as const;
type CandidateRow = {
  requestId: string;
  requestStatus: string;
  cancellationRequestedAt: number | null;
  requestExternalId: string | null;
  requestClientType: string | null;
  queueExternalId: string | null;
  queueStatus: string | null;
  queueClientType: string | null;
  engineId: string | null;
};

function tableExists(sqlite: Database.Database, tableName: string) {
  return Boolean(sqlite.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  ).get(tableName));
}

function columnExists(sqlite: Database.Database, tableName: string, columnName: string) {
  return (sqlite.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string }>)
    .some((column) => column.name === columnName);
}

function placeholders(values: readonly string[]) {
  return values.map(() => "?").join(", ");
}

function isLegacyCandidate(row: CandidateRow) {
  const effectiveClientType = row.queueClientType ?? row.requestClientType;
  if (effectiveClientType === "nooklet") return false;
  if (effectiveClientType === "sabnzbd") return true;

  // A disconnected legacy service cascades its client row away. An active
  // request with neither client attribution nor an engine id is ambiguous and
  // must fail closed; the previous release can expire or cancel it safely.
  return row.engineId === null;
}

function requestCandidates(
  sqlite: Database.Database,
  additionalRequestIds: readonly string[],
) {
  const hasCancellation = columnExists(
    sqlite,
    "download_requests",
    "cancellation_requested_at",
  );
  const hasEngineDownloads = tableExists(sqlite, "engine_downloads");
  const cancellationSelection = hasCancellation
    ? "requests.cancellation_requested_at"
    : "NULL";
  const cancellationPredicate = hasCancellation
    ? " OR requests.cancellation_requested_at IS NOT NULL"
    : "";
  const engineJoin = hasEngineDownloads
    ? "LEFT JOIN engine_downloads AS engine ON engine.id = queue.external_queue_id AND engine.user_id = requests.user_id"
    : "";
  const engineSelection = hasEngineDownloads ? "engine.id" : "NULL";
  const additionalPredicate = additionalRequestIds.length > 0
    ? ` OR requests.id IN (${placeholders(additionalRequestIds)})`
    : "";

  return sqlite.prepare(`
    SELECT
      requests.id AS requestId,
      requests.status AS requestStatus,
      ${cancellationSelection} AS cancellationRequestedAt,
      requests.external_job_id AS requestExternalId,
      request_client.client_type AS requestClientType,
      queue.external_queue_id AS queueExternalId,
      queue.status AS queueStatus,
      queue_client.client_type AS queueClientType,
      ${engineSelection} AS engineId
    FROM download_requests AS requests
    LEFT JOIN download_clients AS request_client ON request_client.id = requests.client_id
    LEFT JOIN download_queue_items AS queue ON queue.request_id = requests.id
    LEFT JOIN download_clients AS queue_client ON queue_client.id = queue.client_id
    ${engineJoin}
    WHERE requests.status IN (${placeholders(activeRequestStatuses)})
      ${cancellationPredicate}
      OR queue.status IN (${placeholders(activeQueueStatuses)})
      OR (queue.status = 'completed' AND requests.status NOT IN ('succeeded', 'cancelled'))
      ${additionalPredicate}
  `).all(
    ...activeRequestStatuses,
    ...activeQueueStatuses,
    ...additionalRequestIds,
  ) as CandidateRow[];
}

function activeImportRequestIds(sqlite: Database.Database) {
  if (!tableExists(sqlite, "download_import_runs")) return new Set<string>();
  return new Set((sqlite.prepare(`
    SELECT DISTINCT request_id AS requestId
    FROM download_import_runs
    WHERE status IN ('pending', 'running')
  `).all() as Array<{ requestId: string }>).map((row) => row.requestId));
}

function cancelledFulfillmentRequestIds(sqlite: Database.Database) {
  if (
    !tableExists(sqlite, "download_fulfillments")
    || !columnExists(sqlite, "download_fulfillments", "cancellation_requested_at")
  ) return new Set<string>();

  return new Set((sqlite.prepare(`
    SELECT DISTINCT requests.id AS requestId
    FROM download_fulfillments AS fulfillments
    JOIN download_requests AS requests ON requests.fulfillment_id = fulfillments.id
    WHERE fulfillments.status IN ('active', 'retry_wait', 'partial')
      AND fulfillments.cancellation_requested_at IS NOT NULL
  `).all() as Array<{ requestId: string }>).map((row) => row.requestId));
}

function queuedImportRequestIds(sqlite: Database.Database) {
  if (!tableExists(sqlite, "jobs")) return new Set<string>();
  return new Set((sqlite.prepare(`
    SELECT target_key AS requestId
    FROM jobs
    WHERE job_type = 'download-import'
      AND target_type = 'download-request'
      AND (is_enabled = 1 OR last_status = 'running')
  `).all() as Array<{ requestId: string }>).map((row) => row.requestId));
}

export class UnsupportedLegacyDownloadWorkError extends Error {
  constructor(public readonly requestIds: string[]) {
    super(
      `This release cannot start while ${requestIds.length} active legacy external-download `
      + `request${requestIds.length === 1 ? " remains" : "s remain"}. `
      + "Return to the previous Nooklet release and finish or cancel that work before upgrading. "
      + `Blocked request id${requestIds.length === 1 ? "" : "s"}: ${requestIds.join(", ")}.`,
    );
    this.name = "UnsupportedLegacyDownloadWorkError";
  }
}

/**
 * Fail before migrations when legacy external-client work would otherwise be
 * stranded by this native-engine-only release. Terminal rows remain intact as
 * read-only history.
 */
export function assertNoActiveLegacyDownloadWork(sqlite: Database.Database) {
  if (
    !tableExists(sqlite, "download_clients")
    || !tableExists(sqlite, "download_requests")
    || !tableExists(sqlite, "download_queue_items")
  ) return;

  const importRequestIds = activeImportRequestIds(sqlite);
  const cancelledPlanRequestIds = cancelledFulfillmentRequestIds(sqlite);
  const queuedImportIds = queuedImportRequestIds(sqlite);
  const candidates = requestCandidates(sqlite, [
    ...new Set([
      ...importRequestIds,
      ...cancelledPlanRequestIds,
      ...queuedImportIds,
    ]),
  ]);
  const byRequestId = new Map<string, CandidateRow[]>();
  for (const candidate of candidates) {
    const rows = byRequestId.get(candidate.requestId) ?? [];
    rows.push(candidate);
    byRequestId.set(candidate.requestId, rows);
  }

  const blockers = new Set<string>();

  for (const [requestId, rows] of byRequestId) {
    if (!rows.some(isLegacyCandidate)) continue;
    if (
      rows.some((row) => (
        activeRequestStatuses.includes(
          row.requestStatus as (typeof activeRequestStatuses)[number],
        )
        || row.cancellationRequestedAt !== null
        || activeQueueStatuses.includes(
          row.queueStatus as (typeof activeQueueStatuses)[number],
        )
        || (row.queueStatus === "completed"
          && !["succeeded", "cancelled"].includes(row.requestStatus))
      ))
      || importRequestIds.has(requestId)
      || cancelledPlanRequestIds.has(requestId)
      || queuedImportIds.has(requestId)
    ) {
      blockers.add(requestId);
    }
  }

  if (blockers.size > 0) {
    throw new UnsupportedLegacyDownloadWorkError([...blockers].sort());
  }
}
