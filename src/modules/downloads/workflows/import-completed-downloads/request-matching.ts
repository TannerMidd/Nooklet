import { type DownloadFailureKind } from "@/modules/downloads/workflows/download-failure-classification";
import { listActiveDownloadRequestsForImport } from "@/modules/downloads/repositories/download-repository";

type ActiveDownloadRequest = Awaited<
    ReturnType<typeof listActiveDownloadRequestsForImport>
>[number];

export type FinishedDownloadRecord = {
    id: string;
    title: string;
    status: string;
    category: string | null;
    storagePath: string | null;
    completedAt: Date | null;
    failMessage: string | null;
    failureKind?: DownloadFailureKind | null;
    downloadedBytes?: number | null;
    sizeLabel: string | null;
    totalMb: number | null;
    statusKind: "completed" | "failed";
};

export type MatchedCompletedDownload = ActiveDownloadRequest & {
    historyItem: FinishedDownloadRecord;
};
