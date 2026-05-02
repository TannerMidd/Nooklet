"use client";

import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { LoaderCircle, Plus, X } from "lucide-react";

import { type RecommendationLibraryActionState } from "@/app/(workspace)/recommendation-action-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

import {
  formatDriveSpaceBytes,
  getDriveSpaceUsagePercent,
  isLowDriveSpace,
  LOW_DRIVE_SPACE_THRESHOLD_BYTES,
} from "./recommendation-drive-space";

export type RecommendationModalFormAction = (formData: FormData) => void;
export type LibraryRequestHiddenField = {
  name: string;
  value: string | number;
};

type RecommendationAddModalShellProps = {
  open: boolean;
  titleId: string;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClassName?: string;
  closeDisabled?: boolean;
  closeButtonLabel?: string;
};

export function SubmitButton({
  serviceLabel,
  disabled = false,
}: {
  serviceLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={pending || disabled}>
      {pending ? (
        <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
      ) : (
        <Plus aria-hidden="true" className="h-4 w-4" />
      )}
      <span>{pending ? `Adding to ${serviceLabel}...` : `Add to ${serviceLabel}`}</span>
    </Button>
  );
}

export function CancelButton({
  onClose,
  disabled = false,
}: {
  onClose: () => void;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="button" variant="secondary" onClick={onClose} disabled={pending || disabled}>
      <X aria-hidden="true" className="h-4 w-4" />
      <span>Cancel</span>
    </Button>
  );
}

export function RecommendationAddMessage({
  state,
}: {
  state: RecommendationLibraryActionState;
}) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className={
        state.status === "success"
          ? "rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-foreground"
          : "rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight"
      }
    >
      {state.message}
    </p>
  );
}

export function RecommendationDestinationFields({
  connectionSummary,
  fieldErrors,
  selectedRootFolderPath,
  selectedQualityProfileId,
  onRootFolderPathChange,
  onQualityProfileIdChange,
  disabled = false,
}: {
  connectionSummary: ServiceConnectionSummary;
  fieldErrors: RecommendationLibraryActionState["fieldErrors"];
  selectedRootFolderPath: string;
  selectedQualityProfileId: number | null;
  onRootFolderPathChange: (value: string) => void;
  onQualityProfileIdChange: (value: number) => void;
  disabled?: boolean;
}) {
  const selectedRootFolder = connectionSummary.rootFolders.find(
    (entry) => entry.path === selectedRootFolderPath,
  );

  return (
    <section className="rounded-lg border border-line/70 bg-panel-strong/60 p-5 md:p-6">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Root folder</span>
            <select
              name="rootFolderPath"
              value={selectedRootFolderPath}
              onChange={(event) => onRootFolderPathChange(event.target.value)}
              disabled={disabled}
              className="min-h-11 w-full rounded-lg border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
              aria-invalid={Boolean(fieldErrors?.rootFolderPath)}
            >
              {connectionSummary.rootFolders.map((entry) => (
                <option key={entry.path} value={entry.path} disabled={isLowDriveSpace(entry)}>
                  {formatRootFolderOptionLabel(entry)}
                </option>
              ))}
            </select>
            {fieldErrors?.rootFolderPath ? (
              <p className="text-sm text-highlight">{fieldErrors.rootFolderPath}</p>
            ) : null}
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Quality profile</span>
            <select
              name="qualityProfileId"
              value={String(selectedQualityProfileId ?? "")}
              onChange={(event) => onQualityProfileIdChange(Number.parseInt(event.target.value, 10))}
              disabled={disabled}
              className="min-h-11 w-full rounded-lg border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
              aria-invalid={Boolean(fieldErrors?.qualityProfileId)}
            >
              {connectionSummary.qualityProfiles.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
            {fieldErrors?.qualityProfileId ? (
              <p className="text-sm text-highlight">{fieldErrors.qualityProfileId}</p>
            ) : null}
          </label>
        </div>

        <RecommendationDriveSpaceStatus rootFolder={selectedRootFolder} />
      </div>
    </section>
  );
}

function formatRootFolderOptionLabel(rootFolder: ServiceConnectionSummary["rootFolders"][number]) {
  const freeSpaceLabel = formatDriveSpaceBytes(rootFolder.freeSpaceBytes);
  const minimumFreeSpaceLabel = formatDriveSpaceBytes(LOW_DRIVE_SPACE_THRESHOLD_BYTES) ?? "75 GB";

  if (freeSpaceLabel && isLowDriveSpace(rootFolder)) {
    return `${rootFolder.label} (${freeSpaceLabel} free, needs ${minimumFreeSpaceLabel})`;
  }

  return freeSpaceLabel ? `${rootFolder.label} (${freeSpaceLabel} free)` : rootFolder.label;
}

function RecommendationDriveSpaceStatus({
  rootFolder,
}: {
  rootFolder: ServiceConnectionSummary["rootFolders"][number] | undefined;
}) {
  if (!rootFolder) {
    return null;
  }

  const freeSpaceLabel = formatDriveSpaceBytes(rootFolder.freeSpaceBytes);
  const totalSpaceLabel = formatDriveSpaceBytes(rootFolder.totalSpaceBytes);
  const minimumFreeSpaceLabel = formatDriveSpaceBytes(LOW_DRIVE_SPACE_THRESHOLD_BYTES) ?? "75 GB";
  const usagePercent = getDriveSpaceUsagePercent(rootFolder);
  const hasLowDriveSpace = isLowDriveSpace(rootFolder);

  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl border px-4 py-3 text-sm",
        hasLowDriveSpace
          ? "border-highlight/30 bg-highlight/10"
          : "border-line/70 bg-panel",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-foreground">Drive space</p>
          <p className="break-words text-muted">{rootFolder.path}</p>
        </div>
        <p
          className={cn(
            "shrink-0 font-medium",
            hasLowDriveSpace ? "text-highlight" : "text-foreground",
          )}
        >
          {freeSpaceLabel
            ? `${freeSpaceLabel} free${totalSpaceLabel ? ` of ${totalSpaceLabel}` : ""}`
            : "Drive space unavailable"}
        </p>
      </div>

      {usagePercent !== null ? (
        <div
          className="h-2 overflow-hidden rounded-full bg-line/70"
          aria-label={`Drive space ${usagePercent}% used`}
        >
          <div
            className={cn("h-full rounded-full", hasLowDriveSpace ? "bg-highlight" : "bg-accent")}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
      ) : null}

      {hasLowDriveSpace ? (
        <p className="leading-6 text-highlight">
          Requests are disabled because this drive has less than {minimumFreeSpaceLabel} free.
        </p>
      ) : null}
    </div>
  );
}

export function RecommendationTagFields({
  connectionSummary,
  fieldErrors,
}: {
  connectionSummary: ServiceConnectionSummary;
  fieldErrors: RecommendationLibraryActionState["fieldErrors"];
}) {
  return (
    <section className="rounded-lg border border-line/70 bg-panel-strong/60 p-5 md:p-6">
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-foreground">Tags</h4>
          <p className="mt-1 text-sm leading-6 text-muted">
            Apply any tags you want the library manager to store on this request.
          </p>
        </div>

        {connectionSummary.tags.length === 0 ? (
          <p className="rounded-lg border border-line/70 bg-panel px-4 py-3 text-sm text-muted">
            No tags were returned by the verified connection.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {connectionSummary.tags.map((tag) => (
              <label
                key={tag.id}
                className="flex items-center gap-2 rounded-lg border border-line/70 bg-panel px-4 py-3 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  name="tagIds"
                  value={tag.id}
                  className="h-4 w-4 rounded border-line bg-panel text-accent"
                />
                <span>{tag.label}</span>
              </label>
            ))}
          </div>
        )}

        {fieldErrors?.tagIds ? <p className="text-sm text-highlight">{fieldErrors.tagIds}</p> : null}
      </div>
    </section>
  );
}

export function RecommendationAddSummaryCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line/70 bg-panel-strong/60 p-5 md:p-6">
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">What happens next</h4>
        <div className="text-sm leading-6 text-muted">{children}</div>
      </div>
    </section>
  );
}

export function RecommendationAddModalShell({
  open,
  titleId,
  title,
  description,
  onClose,
  children,
  maxWidthClassName = "max-w-5xl",
  closeDisabled = false,
  closeButtonLabel = "Close",
}: RecommendationAddModalShellProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      if (!closeDisabled) {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [closeDisabled, onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[150] bg-background/85"
      onClick={() => {
        if (!closeDisabled) {
          onClose();
        }
      }}
    >
      <div className="flex min-h-full items-center justify-center px-4 py-6 md:px-8 md:py-10">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            "flex max-h-[min(88vh,58rem)] w-full flex-col overflow-hidden rounded-xl border border-line/80 bg-panel",
            maxWidthClassName,
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line/70 px-6 py-5 md:px-8 md:py-6">
            <div className="space-y-2">
              <p className="font-heading text-sm italic text-accent">
                Library add
              </p>
              <h3 id={titleId} className="font-heading text-3xl leading-tight text-foreground md:text-4xl">
                {title}
              </h3>
              <p className="max-w-3xl text-sm leading-6 text-muted md:text-base">{description}</p>
            </div>
            <Button type="button" variant="secondary" onClick={onClose} disabled={closeDisabled}>
              <X aria-hidden="true" className="h-4 w-4" />
              <span>{closeButtonLabel}</span>
            </Button>
          </div>

          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}