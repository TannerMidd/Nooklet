import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { type StorageOverview } from "@/modules/storage/queries/get-storage-overview";

function formatBytes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit < 2 ? 0 : 1)} ${units[unit]}`;
}

function capacityPercent(free: number | null, total: number | null) {
  if (free === null || total === null || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(((total - free) / total) * 100)));
}

function CapacityBar({ free, total, label }: { free: number | null; total: number | null; label: string }) {
  const percent = capacityPercent(free, total);
  return (
    <div className="space-y-1.5">
      <div className="h-2 overflow-hidden rounded-full bg-cream/[0.07]">
        {percent !== null ? (
          <div
            className={`h-full rounded-full ${percent >= 90 ? "bg-accent-wine" : "bg-accent-cool"}`}
            style={{ width: `${percent}%` }}
          />
        ) : null}
      </div>
      <p className="text-xs leading-5 text-muted">
        {free !== null && total !== null
          ? `${formatBytes(free)} free of ${formatBytes(total)}${percent !== null ? ` · ${percent}% used` : ""}`
          : label}
      </p>
    </div>
  );
}

export function StorageOverviewView({ overview }: { overview: StorageOverview }) {
  const workspace = overview.downloadWorkspace;
  const workspaceHealthy = workspace.reachable
    && workspace.writable
    && workspace.maximumNewDownloadBytes !== null
    && workspace.maximumNewDownloadBytes > 0;

  return (
    <div className="space-y-6">
      <section aria-labelledby="download-workspace-title" className="rounded-2xl border border-accent/25 bg-accent/[0.06] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">Temporary staging</p>
            <h3 id="download-workspace-title" className="mt-1 text-lg font-semibold text-foreground">Download workspace</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              The built-in downloader saves, repairs, and unpacks files here before importing them into a movie or TV library. Free space on a final media drive does not replace free space here.
            </p>
          </div>
          <Badge variant={workspaceHealthy ? "accent-cool" : "wine"}>
            {workspaceHealthy ? "Ready" : "Needs attention"}
          </Badge>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg bg-cream/[0.04] p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Effective path</dt>
            <dd className="mt-1 break-all font-mono text-xs leading-5 text-foreground">{workspace.effectivePath}</dd>
          </div>
          <div className="rounded-lg bg-cream/[0.04] p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Safety + processing reserve</dt>
            <dd className="mt-1 font-semibold text-foreground">{formatBytes(workspace.processingReservationBytes)}</dd>
          </div>
          <div className="rounded-lg bg-cream/[0.04] p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Active download data</dt>
            <dd className="mt-1 font-semibold text-foreground">{formatBytes(workspace.activeDownloadBytes)}</dd>
          </div>
          <div className="rounded-lg bg-cream/[0.04] p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Approx. largest new release</dt>
            <dd className="mt-1 font-semibold text-foreground">{formatBytes(workspace.maximumNewDownloadBytes)}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <CapacityBar
            free={workspace.freeSpaceBytes}
            total={workspace.totalSpaceBytes}
            label="Workspace capacity is unavailable."
          />
        </div>
        <p className={`mt-3 text-sm ${workspaceHealthy ? "text-muted" : "text-accent-wine"}`}>
          {workspaceHealthy
            ? workspace.statusMessage
            : workspace.maximumNewDownloadBytes === 0
              ? "The workspace is below the safety reserve. Free space before starting another download."
              : workspace.statusMessage}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted">
          This estimate already accounts for Nooklet&apos;s 512 MB reserve and the temporary second copy needed while unpacking. The exact requirement appears before each request is queued.
        </p>
      </section>

      <section aria-labelledby="final-destinations-title" className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-cool">Permanent media</p>
          <h3 id="final-destinations-title" className="mt-1 text-lg font-semibold text-foreground">Final library destinations</h3>
          <p className="mt-1 text-sm leading-6 text-muted">Completed files move from the download workspace into one of these folders.</p>
        </div>

        {overview.libraryDestinations.length === 0 ? (
          <EmptyState message="No movie or TV library destination is configured yet." />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {overview.libraryDestinations.map((destination) => (
              <li key={destination.pathId} className="rounded-xl border border-cream/[0.08] bg-cream/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{destination.label}</p>
                      <Badge variant={destination.mediaType === "tv" ? "accent-cool" : "accent"}>
                        {destination.mediaType === "tv" ? "TV" : "Movies"}
                      </Badge>
                      {destination.isDownloadDefault ? <Badge variant="highlight">Default</Badge> : null}
                    </div>
                    {destination.libraryName.trim().toLowerCase() !== destination.label.trim().toLowerCase() ? (
                      <p className="mt-1 text-xs text-muted">{destination.libraryName}</p>
                    ) : null}
                  </div>
                  <Badge variant={destination.live && destination.writable ? "accent-cool" : "wine"}>
                    {destination.live && destination.writable ? "Writable" : destination.live ? "Read-only" : "Unreachable"}
                  </Badge>
                </div>
                <p className="mt-3 break-all font-mono text-xs leading-5 text-foreground">{destination.effectivePath}</p>
                <div className="mt-3">
                  <CapacityBar
                    free={destination.freeSpaceBytes}
                    total={destination.totalSpaceBytes}
                    label="No live capacity reading is available."
                  />
                </div>
                <p className={`mt-2 text-xs leading-5 ${destination.live && destination.writable ? "text-muted" : "text-accent-wine"}`}>
                  {destination.statusMessage}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="rounded-xl border border-cream/[0.10] bg-cream/[0.03] p-4 text-sm leading-6 text-muted">
        <p className="font-semibold text-foreground">{overview.runtime === "container" ? "Docker path guidance" : "Path guidance"}</p>
        <p className="mt-1">{overview.runtimeGuidance}</p>
        {overview.runtime === "container" ? (
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs">
            <li>Bind the spacious host folder (for example <code className="text-foreground">F:\NookletDownloads</code>) to <code className="text-foreground">/downloads</code> in <code className="text-foreground">docker-compose.yml</code>.</li>
            <li>Set <code className="text-foreground">DOWNLOAD_ENGINE_DIR=/downloads/nooklet-engine</code> in <code className="text-foreground">.env</code>.</li>
            <li>Run <code className="text-foreground">docker compose up -d --force-recreate</code>, then return here and confirm the effective path and capacity.</li>
          </ol>
        ) : (
          <p className="mt-3 text-xs">To move staging to another drive, set <code className="text-foreground">DOWNLOAD_ENGINE_DIR</code> to a writable folder such as <code className="text-foreground">F:\NookletDownloads</code>, restart Nooklet, then verify the capacity here.</p>
        )}
        <p className="mt-2 text-xs">
          Approved media roots: {overview.approvedMediaRoots.length > 0
            ? overview.approvedMediaRoots.join(", ")
            : "None configured. Set APPROVED_MEDIA_ROOTS before attaching folders."}
        </p>
      </aside>
    </div>
  );
}
