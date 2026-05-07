import { listUsersWithActiveDownloadRequests } from "@/modules/downloads/repositories/download-repository";

export async function listUsersWithActiveDownloadRequestsForImport() {
  return listUsersWithActiveDownloadRequests();
}
