"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Plus } from "lucide-react";

import {
  initialRecommendationLibraryActionState,
} from "@/app/(workspace)/recommendation-action-state";
import { submitRecommendationLibraryAction } from "@/app/(workspace)/recommendation-item-actions";
import {
  TitleRequestControls,
  type LibraryOption,
  type QualityProfileOption,
} from "@/components/media-library/title-request-controls";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { cn } from "@/lib/utils";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";

function AddToNookletButton({
  completionLabel,
  downloadNow,
  buttonClassName,
}: {
  completionLabel: string | null;
  downloadNow: boolean;
  buttonClassName?: string;
}) {
  const { pending } = useFormStatus();
  const isComplete = completionLabel !== null;
  const ButtonIcon = isComplete ? Check : Plus;

  return (
    <Button
      type="submit"
      className={cn("w-full sm:w-auto", buttonClassName)}
      disabled={isComplete || pending}
    >
      {pending ? <Spinner /> : <ButtonIcon aria-hidden="true" className="h-4 w-4" />}
      <span>
        {pending
          ? "Requesting..."
          : completionLabel ?? (downloadNow ? "Request & download" : "Add to library only")}
      </span>
    </Button>
  );
}

function PendingHint() {
  const { pending } = useFormStatus();

  if (!pending) {
    return null;
  }

  return (
    <p className="text-xs text-muted" role="status">
      Syncing metadata and searching indexers — a full series can take a minute.
    </p>
  );
}

type RecommendationAddFormProps = {
  itemId: string;
  existingInLibrary?: boolean;
  returnTo: string;
  variant?: "default" | "compact";
  buttonClassName?: string;
  mediaType: RecommendationMediaType;
  tmdbId?: number | null;
  titleLabel: string;
  libraries: LibraryOption[];
  qualityProfiles: readonly QualityProfileOption[];
  pathOptions: MediaLibraryPathOption[];
};

export function RecommendationAddForm({
  itemId,
  existingInLibrary,
  returnTo,
  variant = "default",
  buttonClassName,
  mediaType,
  tmdbId,
  titleLabel,
  libraries,
  qualityProfiles,
  pathOptions,
}: RecommendationAddFormProps) {
  const [state, formAction] = useActionState(
    submitRecommendationLibraryAction,
    initialRecommendationLibraryActionState,
  );
  const [downloadNow, setDownloadNow] = useState(true);
  const isCompact = variant === "compact";
  const completionLabel = state.outcome === "queued"
    ? "Download queued"
    : state.outcome === "catalog_added"
      ? "Added to catalog"
      : state.outcome === "partial_queue"
        ? "Partially queued"
        : state.outcome === "no_match"
          ? "Added; no release found"
          : state.outcome === "search_failed"
            ? "Added; search needs attention"
            : state.outcome === "queue_failed"
            ? "Added; queue needs attention"
            : null;

  function renderCompactNotice(message: string, tone: "success" | "muted" | "error") {
    return (
      <p
        role={tone === "error" ? "alert" : "status"}
        className={cn(
          "rounded-lg px-3 py-2 text-sm leading-6",
          tone === "success" && "border border-accent/20 bg-accent/10 text-foreground",
          tone === "muted" && "border border-cream/[0.08] bg-cream/[0.04] text-muted",
          tone === "error" && "border border-accent-wine/30 bg-accent-wine/10 text-accent-wine",
        )}
      >
        {message}
      </p>
    );
  }

  if (existingInLibrary) {
    return renderCompactNotice(
      isCompact
        ? "Already tracked in your catalog."
        : "This recommendation is already tracked in your catalog.",
      "success",
    );
  }

  const requestForm = (
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="notificationTitle" value={titleLabel} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <TitleRequestControls
          mediaType={mediaType}
          tmdbId={tmdbId ?? null}
          titleLabel={titleLabel}
          libraries={libraries}
          qualityProfiles={qualityProfiles}
          pathOptions={pathOptions}
          onDownloadNowChange={setDownloadNow}
        />
        <AddToNookletButton
          completionLabel={completionLabel}
          downloadNow={downloadNow}
          buttonClassName={buttonClassName}
        />
        <PendingHint />
      </form>
  );

  return (
    <div className={cn(isCompact ? "w-full min-w-0 space-y-2" : "mt-4 space-y-3")}>
      {isCompact ? (
        <details className="rounded-xl border border-cream/[0.08] bg-cream/[0.025] p-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            Review request
          </summary>
          <div className="mt-3 border-t border-cream/[0.08] pt-3">{requestForm}</div>
        </details>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Request title</p>
          </div>
          {requestForm}
        </>
      )}

      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={cn(
            "rounded-lg px-3 py-2 text-sm leading-6",
            state.status === "success" && "border border-accent/20 bg-accent/10 text-foreground",
            state.status === "warning" && "border border-accent/25 bg-accent/10 text-foreground",
            state.status === "error" && "border border-accent-wine/30 bg-accent-wine/10 text-accent-wine",
          )}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
