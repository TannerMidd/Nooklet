export type DownloadQueueItem = {
    id: string;
    title: string;
    status: string;
    progressPercent: number;
    timeLeft: string | null;
    category: string | null;
    priority: string | null;
    labels: string[];
    sizeLabel: string | null;
    sizeLeftLabel: string | null;
    totalMb: number | null;
    remainingMb: number | null;
};

export type DownloadQueueSnapshot = {
    version: string;
    queueStatus: string | null;
    paused: boolean;
    speed: string | null;
    kbPerSec: number | null;
    timeLeft: string | null;
    activeQueueCount: number;
    totalQueueCount: number;
    items: DownloadQueueItem[];
};

export type DownloadQueueConnectionStatus = "disconnected" | "configured" | "verified" | "error";

export type ActiveDownloadQueueState = {
    connectionStatus: DownloadQueueConnectionStatus;
    statusMessage: string;
    snapshot: DownloadQueueSnapshot | null;
    action?: {
        status: "applied" | "pending";
        message: string;
    };
};
