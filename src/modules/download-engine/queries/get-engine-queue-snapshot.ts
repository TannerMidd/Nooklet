import {
    type DownloadQueueItem,
    type DownloadQueueSnapshot,
} from "@/modules/download-engine/queue/download-queue";
import {
    listActiveEngineDownloads,
    type EngineDownloadRecord,
} from "@/modules/download-engine/queue/engine-repository";

/**
 * Maps persisted engine state onto the browser-facing download queue shape.
 */

function formatBytes(value: number) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = value;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    return `${size.toFixed(unitIndex <= 1 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatSpeed(bytesPerSecond: number) {
    return `${formatBytes(bytesPerSecond)}`;
}

function formatEta(seconds: number) {
    if (seconds < 60) {
        return `${Math.max(1, Math.round(seconds))}s`;
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return `${minutes}m`;
    }

    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function stateLabel(record: EngineDownloadRecord) {
    if (record.controlIntent === "cancel") {
        return "Cancelling";
    }

    if (record.controlIntent === "pause") {
        return "Pausing";
    }

    const { state } = record;

    switch (state) {
        case "queued":
            return "Queued";
        case "fetching":
            return "Downloading";
        case "repairing":
            return "Repairing";
        case "extracting":
            return "Extracting";
        case "paused":
            return "Paused";
        case "completed":
            return "Completed";
        case "failed":
            return "Failed";
    }
}

function toQueueItem(record: EngineDownloadRecord): DownloadQueueItem {
    const progressPercent =
        record.totalSegments > 0
            ? Math.min(100, (record.completedSegments / record.totalSegments) * 100)
            : 0;
    const speed = record.state === "fetching" ? record.bytesPerSecond : null;
    const remainingBytes = Math.max(0, record.totalBytes - record.downloadedBytes);
    const etaSeconds = speed && speed > 0 ? remainingBytes / speed : null;

    return {
        id: record.id,
        title: record.name,
        status: stateLabel(record),
        progressPercent,
        timeLeft: etaSeconds !== null ? formatEta(etaSeconds) : null,
        category: record.category,
        priority: record.priority === 0 ? "Normal" : record.priority < 0 ? "High" : "Low",
        labels: [
            ...(record.failedSegments > 0 ? [`${record.failedSegments} damaged segments`] : []),
            ...(record.errorMessage && record.state === "queued" ? [record.errorMessage] : []),
        ],
        sizeLabel: record.totalBytes > 0 ? formatBytes(record.totalBytes) : null,
        sizeLeftLabel: record.totalBytes > 0 ? formatBytes(remainingBytes) : null,
        totalMb: record.totalBytes > 0 ? record.totalBytes / (1024 * 1024) : null,
        remainingMb: record.totalBytes > 0 ? remainingBytes / (1024 * 1024) : null,
    };
}

export async function getEngineQueueSnapshot(userId: string): Promise<DownloadQueueSnapshot> {
    const records = await listActiveEngineDownloads(userId);
    const fetching = records.find((record) => record.state === "fetching");
    const speed = fetching?.bytesPerSecond ?? null;
    const activeCount = records.filter((record) => record.state !== "paused").length;
    const remainingBytes = records.reduce(
        (total, record) => total + Math.max(0, record.totalBytes - record.downloadedBytes),
        0,
    );
    const etaSeconds = speed && speed > 0 ? remainingBytes / speed : null;
    const allPaused = records.length > 0 && records.every((record) => record.state === "paused");

    return {
        version: "nooklet-engine",
        queueStatus:
            records.length === 0
                ? "Idle"
                : records.some((record) => record.controlIntent === "cancel")
                  ? "Cancelling"
                  : allPaused
                    ? "Paused"
                    : fetching
                      ? "Downloading"
                      : "Queued",
        paused: allPaused,
        speed: speed !== null ? formatSpeed(speed) : null,
        kbPerSec: speed !== null ? speed / 1024 : null,
        timeLeft: etaSeconds !== null ? formatEta(etaSeconds) : null,
        activeQueueCount: activeCount,
        totalQueueCount: records.length,
        items: records.map(toQueueItem),
    };
}
