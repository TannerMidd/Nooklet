import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

import { type MissingContentDispatchOutcome } from "./release-dispatch";

export type MissingContentSearchReport = {
  searchedCount: number;
  queuedCount: number;
  unmatchedCount: number;
};

export async function recordMissingContentSearchReport(
  userId: string,
  outcomes: MissingContentDispatchOutcome[],
): Promise<MissingContentSearchReport> {
  const report: MissingContentSearchReport = {
    searchedCount: outcomes.length,
    queuedCount: outcomes.filter((outcome) => outcome.queued).length,
    unmatchedCount: outcomes.filter((outcome) => !outcome.queued).length,
  };

  if (outcomes.length > 0) {
    await recordAuditEvent({
      actorUserId: userId,
      eventType: "media-library.missing-search.completed",
      subjectType: "media-library-missing-search",
      subjectId: "all",
      payload: {
        searchedCount: report.searchedCount,
        queuedCount: report.queuedCount,
        unmatchedCount: report.unmatchedCount,
        queuedItems: outcomes
          .filter((outcome) => outcome.queued)
          .map((outcome) => outcome.candidate.label),
      },
    });
  }

  return report;
}
