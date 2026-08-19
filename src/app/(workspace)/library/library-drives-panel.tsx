import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SetDefaultPathForm } from "@/app/(workspace)/library/set-default-path-button";
import { type LibraryDriveEntry } from "@/modules/media-library/queries/get-library-drive-overview";

function formatBytes(value: number | null) {
    if (value === null || !Number.isFinite(value)) {
        return "Unknown";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = value;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    return `${size.toFixed(unitIndex <= 1 ? 0 : 1)} ${units[unitIndex]}`;
}

function usedPercent(entry: LibraryDriveEntry) {
    if (
        entry.totalSpaceBytes === null ||
        entry.freeSpaceBytes === null ||
        entry.totalSpaceBytes <= 0
    ) {
        return null;
    }

    const used = entry.totalSpaceBytes - entry.freeSpaceBytes;

    return Math.min(100, Math.max(0, Math.round((used / entry.totalSpaceBytes) * 100)));
}

function spaceBarTone(percent: number) {
    if (percent >= 92) {
        return "bg-accent-wine";
    }

    if (percent >= 80) {
        return "bg-accent-wine";
    }

    return "bg-accent-cool";
}

function DriveRow({ entry }: { entry: LibraryDriveEntry }) {
    const percent = usedPercent(entry);
    const mediaLabel =
        entry.mediaType === "tv" ? "TV" : entry.mediaType === "youtube" ? "YouTube" : "Movies";

    return (
        <li className="rounded-lg border border-cream/[0.08] bg-cream/[0.03] px-3.5 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{entry.label}</p>
                        <Badge variant={entry.mediaType === "tv" ? "accent-cool" : "accent"}>
                            {mediaLabel}
                        </Badge>
                        {entry.isDownloadDefault ? (
                            <Badge variant="highlight">Default</Badge>
                        ) : null}
                        {!entry.live ? <Badge>Last known</Badge> : null}
                    </div>
                    <p className="truncate text-xs text-muted">
                        {entry.path} / {entry.libraryName}
                    </p>
                </div>
                {!entry.isDownloadDefault ? <SetDefaultPathForm pathId={entry.pathId} /> : null}
            </div>
            <div className="mt-2.5 space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-cream/[0.04]">
                    {percent !== null ? (
                        <div
                            className={`h-full rounded-full transition-[width] duration-500 ${spaceBarTone(percent)}`}
                            style={{ width: `${percent}%` }}
                        />
                    ) : null}
                </div>
                <p className="text-xs text-muted">
                    {entry.freeSpaceBytes !== null && entry.totalSpaceBytes !== null
                        ? `${formatBytes(entry.freeSpaceBytes)} free of ${formatBytes(entry.totalSpaceBytes)}${percent !== null ? ` (${percent}% used)` : ""}`
                        : "Space unknown — folder is unreachable and has no stored reading."}
                </p>
            </div>
        </li>
    );
}

export function LibraryDrivesPanel({ entries }: { entries: LibraryDriveEntry[] }) {
    if (entries.length === 0) {
        return (
            <EmptyState message="Attach a library folder to see drive space and set download defaults." />
        );
    }

    return (
        <div className="space-y-3">
            <p className="text-sm leading-6 text-muted">
                Downloads without an explicit destination go to the default folder for their media
                type, including YouTube. Marked folders are preselected in request forms.
            </p>
            <ul className="grid gap-2.5 lg:grid-cols-2">
                {entries.map((entry) => (
                    <DriveRow key={entry.pathId} entry={entry} />
                ))}
            </ul>
        </div>
    );
}
