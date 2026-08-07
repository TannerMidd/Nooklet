import {
    expireStalePendingDownloadReservations,
    listUsersWithActiveDownloadRequests,
} from "@/modules/downloads/repositories/download-repository";

export async function listUsersWithActiveDownloadRequestsForImport() {
    await expireStalePendingDownloadReservations();

    return listUsersWithActiveDownloadRequests();
}
