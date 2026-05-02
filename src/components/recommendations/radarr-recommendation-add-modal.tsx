"use client";

import { type RecommendationLibraryActionState } from "@/app/(workspace)/recommendation-action-state";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

import {
  CancelButton,
  type LibraryRequestHiddenField,
  RecommendationAddMessage,
  RecommendationAddModalShell,
  RecommendationAddSummaryCard,
  RecommendationDestinationFields,
  RecommendationTagFields,
  SubmitButton,
  type RecommendationModalFormAction,
} from "./recommendation-add-modal-primitives";
import { isLowDriveSpace } from "./recommendation-drive-space";

type RadarrRecommendationAddModalProps = {
  open: boolean;
  onClose: () => void;
  hiddenFields: readonly LibraryRequestHiddenField[];
  connectionSummary: ServiceConnectionSummary;
  state: RecommendationLibraryActionState;
  formAction: RecommendationModalFormAction;
  selectedRootFolderPath: string;
  selectedQualityProfileId: number | null;
  onRootFolderPathChange: (value: string) => void;
  onQualityProfileIdChange: (value: number) => void;
  isSavingDefaults?: boolean;
  titleId: string;
};

export function RadarrRecommendationAddModal({
  open,
  onClose,
  hiddenFields,
  connectionSummary,
  state,
  formAction,
  selectedRootFolderPath,
  selectedQualityProfileId,
  onRootFolderPathChange,
  onQualityProfileIdChange,
  isSavingDefaults = false,
  titleId,
}: RadarrRecommendationAddModalProps) {
  const selectedRootFolder = connectionSummary.rootFolders.find(
    (entry) => entry.path === selectedRootFolderPath,
  );
  const requestDisabled =
    isSavingDefaults ||
    !selectedRootFolder ||
    isLowDriveSpace(selectedRootFolder) ||
    selectedQualityProfileId === null;

  return (
    <RecommendationAddModalShell
      open={open}
      onClose={onClose}
      titleId={titleId}
      title="Add to Radarr"
      description="Choose where the movie should go and which tags Radarr should store with it."
      maxWidthClassName="max-w-5xl"
      closeDisabled={isSavingDefaults}
      closeButtonLabel={isSavingDefaults ? "Saving..." : "Close"}
    >
      <form action={formAction} className="flex min-h-0 flex-1 flex-col">
        {hiddenFields.map((field, index) => (
          <input
            key={`${field.name}-${String(field.value)}-${index}`}
            type="hidden"
            name={field.name}
            value={String(field.value)}
          />
        ))}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 md:px-8 md:py-7">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
            <div className="space-y-6">
              <RecommendationDestinationFields
                connectionSummary={connectionSummary}
                fieldErrors={state.fieldErrors}
                selectedRootFolderPath={selectedRootFolderPath}
                selectedQualityProfileId={selectedQualityProfileId}
                onRootFolderPathChange={onRootFolderPathChange}
                onQualityProfileIdChange={onQualityProfileIdChange}
                disabled={isSavingDefaults}
              />
            </div>

            <div className="space-y-6">
              <RecommendationTagFields
                connectionSummary={connectionSummary}
                fieldErrors={state.fieldErrors}
              />
              <RecommendationAddSummaryCard>
                Nooklet searches Radarr by title and year, then submits the destination and tag
                options you selected here.
              </RecommendationAddSummaryCard>
              <RecommendationAddMessage state={state} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-line/70 px-6 py-5 sm:flex-row sm:items-center sm:justify-between md:px-8 md:py-6">
          <p className="text-sm leading-6 text-muted">
            The request stays on this page. Close the modal at any time before submitting.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <CancelButton onClose={onClose} disabled={isSavingDefaults} />
            <SubmitButton serviceLabel="Radarr" disabled={requestDisabled} />
          </div>
        </div>
      </form>
    </RecommendationAddModalShell>
  );
}