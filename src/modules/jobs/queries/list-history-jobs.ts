import { listJobsForUser } from "@/modules/jobs/repositories/job-repository";
import { type JobType } from "@/lib/database/schema";

/**
 * Public read seam for the recent job activity surfaced on the watch-history
 * settings page. Wraps the jobs repository so the route does not depend on
 * the persistence layer directly.
 */
export async function listHistoryJobs(userId: string, jobType?: JobType) {
  return listJobsForUser(userId, jobType);
}
