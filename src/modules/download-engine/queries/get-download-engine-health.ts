import { and, eq, inArray } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  engineDownloads,
  type EngineDownloadFailureKind,
  type EngineDownloadState,
} from "@/lib/database/schema";
import {
  readDownloadEngineLoopHealth,
  type DownloadEngineLoopHealth,
} from "@/modules/download-engine/runtime/engine-heartbeat";

export type DownloadEngineHealthStatus = "idle" | "ok" | "degraded";

type DownloadEngineHealthRow = {
  id: string;
  name: string;
  state: EngineDownloadState;
  controlIntent: "pause" | "cancel" | null;
  failureKind: EngineDownloadFailureKind | null;
  errorMessage: string | null;
  totalBytes: number;
  updatedAt: Date;
  importedAt: Date | null;
};

export type DownloadEngineHealthIssue = {
  id: string;
  name: string;
  state: EngineDownloadState | "runner";
  lastProgressAt: Date | null;
  message: string;
};

export type DownloadEngineHealth = {
  status: DownloadEngineHealthStatus;
  activeCount: number;
  stalledCount: number;
  failedCount: number;
  activeStage: EngineDownloadState | null;
  lastProgressAt: Date | null;
  hasLoopError: boolean;
  issues: DownloadEngineHealthIssue[];
};

const minute = 60_000;
const hour = 60 * minute;
const activeStates = [
  "queued",
  "fetching",
  "assembling",
  "repairing",
  "extracting",
] as const satisfies readonly EngineDownloadState[];
const processingStates = [
  "fetching",
  "assembling",
  "repairing",
  "extracting",
] as const satisfies readonly EngineDownloadState[];

/**
 * These thresholds are diagnostic only. They never terminate work or make the
 * container unready. Post-processing allowances scale with payload size so a
 * legitimate large repair, extraction, or cross-filesystem copy is not
 * treated like a short network-stage stall.
 */
export function downloadEngineStageStaleAfterMs(
  state: (typeof activeStates)[number],
  totalBytes: number,
) {
  const safeBytes = Number.isSafeInteger(totalBytes) && totalBytes > 0 ? totalBytes : 0;
  const scaledAllowance = (bytesPerSecond: number, fixedAllowanceMs: number) => (
    Math.ceil(safeBytes / bytesPerSecond) * 1_000 + fixedAllowanceMs
  );

  switch (state) {
    case "queued":
      return 5 * minute;
    case "fetching":
      // A single NNTP segment can make three 30-second attempts. Fifteen
      // minutes leaves ample room for the availability probe and reconnects.
      return 15 * minute;
    case "assembling":
      return Math.max(45 * minute, scaledAllowance(2 * 1024 * 1024, 15 * minute));
    case "repairing":
      return Math.max(2 * hour, scaledAllowance(512 * 1024, 30 * minute));
    case "extracting":
      return Math.max(2 * hour, scaledAllowance(1024 * 1024, 30 * minute));
  }
}

function newestDate(rows: DownloadEngineHealthRow[]) {
  return rows.reduce<Date | null>((latest, row) => (
    !latest || row.updatedAt.getTime() > latest.getTime() ? row.updatedAt : latest
  ), null);
}

function hasUnresolvedLoopFailure(loop: DownloadEngineLoopHealth) {
  if (!loop.lastLoopFailedAt || !loop.lastLoopError) return false;
  return !loop.lastLoopSucceededAt
    || loop.lastLoopFailedAt.getTime() > loop.lastLoopSucceededAt.getTime();
}

export function evaluateDownloadEngineHealth(
  rows: DownloadEngineHealthRow[],
  loop: DownloadEngineLoopHealth,
  now = Date.now(),
): DownloadEngineHealth {
  const active = rows.filter((row) => (
    (activeStates as readonly EngineDownloadState[]).includes(row.state)
  ));
  const processing = active.filter((row) => (
    (processingStates as readonly EngineDownloadState[]).includes(row.state)
  ));
  const stallCandidates = active.filter((row) => row.state !== "queued" || processing.length === 0);
  const stalled = stallCandidates.filter((row) => (
    now - row.updatedAt.getTime()
      > downloadEngineStageStaleAfterMs(row.state as (typeof activeStates)[number], row.totalBytes)
  ));
  const failed = rows.filter((row) => (
    row.state === "failed"
    && row.importedAt === null
    && row.failureKind !== "content"
    && row.failureKind !== "cancelled"
  ));
  const hasLoopError = hasUnresolvedLoopFailure(loop);
  const issues: DownloadEngineHealthIssue[] = [
    ...stalled.map((row) => ({
      id: row.id,
      name: row.name,
      state: row.state,
      lastProgressAt: row.updatedAt,
      message: `${row.state} has not recorded meaningful progress within its diagnostic window.`,
    })),
    ...failed.map((row) => ({
      id: row.id,
      name: row.name,
      state: row.state,
      lastProgressAt: row.updatedAt,
      message: row.errorMessage ?? "The built-in download failed unexpectedly.",
    })),
    ...(hasLoopError ? [{
      id: "download-engine-runner",
      name: "Download engine runner",
      state: "runner" as const,
      lastProgressAt: loop.lastLoopFailedAt,
      message: loop.lastLoopError!,
    }] : []),
  ];

  return {
    status: issues.length > 0 ? "degraded" : active.length > 0 ? "ok" : "idle",
    activeCount: active.length,
    stalledCount: stalled.length,
    failedCount: failed.length,
    activeStage: processing[0]?.state ?? active[0]?.state ?? null,
    lastProgressAt: newestDate(active),
    hasLoopError,
    issues,
  };
}

/** DB/file-only diagnostic query; it never touches a configured media path. */
export function getDownloadEngineHealth(userId?: string, now = Date.now()) {
  const database = ensureDatabaseReady();
  const rows = database
    .select({
      id: engineDownloads.id,
      name: engineDownloads.name,
      state: engineDownloads.state,
      controlIntent: engineDownloads.controlIntent,
      failureKind: engineDownloads.failureKind,
      errorMessage: engineDownloads.errorMessage,
      totalBytes: engineDownloads.totalBytes,
      updatedAt: engineDownloads.updatedAt,
      importedAt: engineDownloads.importedAt,
    })
    .from(engineDownloads)
    .where(and(
      userId ? eq(engineDownloads.userId, userId) : undefined,
      inArray(engineDownloads.state, [...activeStates, "failed"]),
    ))
    .all();

  return evaluateDownloadEngineHealth(rows, readDownloadEngineLoopHealth(), now);
}
