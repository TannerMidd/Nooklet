import { type JobType } from "@/lib/database/schema";
import { listJobsForUser } from "@/modules/jobs/repositories/job-repository";

export async function listUserJobs(userId: string, jobType?: JobType) {
  return listJobsForUser(userId, jobType);
}