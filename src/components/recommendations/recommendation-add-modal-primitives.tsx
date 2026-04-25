"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";

import { type RecommendationLibraryActionState } from "@/app/(workspace)/recommendation-action-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

export type RecommendationModalFormAction = (formData: FormData) => void;

type RecommendationAddModalShellProps = {
  open: boolean;
  titleId: string;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClassName?: string;
};

export function SubmitButton({ serviceLabel }: { serviceLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
      {pending ? `Adding to ${serviceLabel}...` : `Add to ${serviceLabel}`}
    </Button>
  );
}

export function CancelButton({ onClose }: { onClose: () => void }) {
  const { pending } = useFormStatus();

  return (
    <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
      Cancel
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
}: {
  connectionSummary: ServiceConnectionSummary;
  fieldErrors: RecommendationLibraryActionState["fieldErrors"];
}) {
  return (
    <section className="rounded-[28px] border border-line/70 bg-panel-strong/70 p-5 md:p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Root folder</span>
          <select
            name="rootFolderPath"
            defaultValue={connectionSummary.rootFolders[0]?.path ?? ""}
            className="min-h-11 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
            aria-invalid={Boolean(fieldErrors?.rootFolderPath)}
          >
            {connectionSummary.rootFolders.map((entry) => (
              <option key={entry.path} value={entry.path}>
                {entry.label}
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
            defaultValue={String(connectionSummary.qualityProfiles[0]?.id ?? "")}
            className="min-h-11 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
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
    </section>
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
    <section className="rounded-[28px] border border-line/70 bg-panel-strong/70 p-5 md:p-6">
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-foreground">Tags</h4>
          <p className="mt-1 text-sm leading-6 text-muted">
            Apply any tags you want the library manager to store on this request.
          </p>
        </div>

        {connectionSummary.tags.length === 0 ? (
          <p className="rounded-2xl border border-line/70 bg-panel px-4 py-3 text-sm text-muted">
            No tags were returned by the verified connection.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {connectionSummary.tags.map((tag) => (
              <label
                key={tag.id}
                className="flex items-center gap-2 rounded-2xl border border-line/70 bg-panel px-4 py-3 text-sm text-foreground"
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
    <section className="rounded-[28px] border border-line/70 bg-panel-strong/70 p-5 md:p-6">
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
}: RecommendationAddModalShellProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    return () => {
      setIsMounted(false);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!isMounted || !open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-background/80 backdrop-blur-md" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center px-4 py-6 md:px-8 md:py-10">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            "flex max-h-[min(88vh,58rem)] w-full flex-col overflow-hidden rounded-[36px] border border-line/80 bg-panel shadow-soft",
            maxWidthClassName,
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line/70 px-6 py-5 md:px-8 md:py-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
                Library add
              </p>
              <h3 id={titleId} className="font-heading text-3xl leading-tight text-foreground md:text-4xl">
                {title}
              </h3>
              <p className="max-w-3xl text-sm leading-6 text-muted md:text-base">{description}</p>
            </div>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>

          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}