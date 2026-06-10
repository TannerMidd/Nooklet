import { selectMissingContentCandidates } from "./candidate-selection";
import { budgetMissingContentCandidates } from "./search-budgeting";
import { dispatchMissingContentSearches } from "./release-dispatch";
import {
  recordMissingContentSearchReport,
  type MissingContentSearchReport,
} from "./run-reporting";

export type { MissingContentSearchReport };

export async function searchMissingMonitoredContentWorkflow(
  userId: string,
): Promise<MissingContentSearchReport> {
  const candidates = await selectMissingContentCandidates(userId);
  const budgeted = await budgetMissingContentCandidates(userId, candidates);
  const outcomes = await dispatchMissingContentSearches(userId, budgeted);
  return recordMissingContentSearchReport(userId, outcomes);
}
