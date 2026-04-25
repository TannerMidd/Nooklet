"use client";

import { type RecommendationLibraryActionState } from "@/app/(workspace)/recommendation-action-state";
import { type RecommendationProviderSeason } from "@/modules/recommendations/provider-metadata";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

import {
  CancelButton,
  RecommendationAddMessage,
  RecommendationAddModalShell,
  RecommendationAddSummaryCard,
  RecommendationDestinationFields,
  RecommendationTagFields,
  SubmitButton,
  type RecommendationModalFormAction,
} from "./recommendation-add-modal-primitives";

type SonarrRecommendationAddModalProps = {
  open: boolean;
  onClose: () => void;
  itemId: string;
  returnTo: string;
  connectionSummary: ServiceConnectionSummary;
  state: RecommendationLibraryActionState;
  formAction: RecommendationModalFormAction;
  availableSeasons: RecommendationProviderSeason[];
  seasonSelectionMode: "all" | "custom";
  onSeasonSelectionModeChange: (mode: "all" | "custom") => void;
  defaultRootFolderPath: string;
  defaultQualityProfileId: number | null;
  titleId: string;
};

export function SonarrRecommendationAddModal({
  open,
  onClose,
  itemId,
  returnTo,
  connectionSummary,
  state,
  formAction,
  availableSeasons,
  seasonSelectionMode,
  onSeasonSelectionModeChange,
  defaultRootFolderPath,
  defaultQualityProfileId,
  titleId,
}: SonarrRecommendationAddModalProps) {
  return (
    <RecommendationAddModalShell
      open={open}
      onClose={onClose}
      titleId={titleId}
      title="Add to Sonarr"
      description="Choose where the series should go and which seasons Sonarr should monitor."
      maxWidthClassName="max-w-6xl"
    >
      <form action={formAction} className="flex min-h-0 flex-1 flex-col">
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 md:px-8 md:py-7">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
            <div className="space-y-6">
              <RecommendationDestinationFields
                connectionSummary={connectionSummary}
                fieldErrors={state.fieldErrors}
                defaultRootFolderPath={defaultRootFolderPath}
                defaultQualityProfileId={defaultQualityProfileId}
              />

              <section className="rounded-[28px] border border-line/70 bg-panel-strong/70 p-5 md:p-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-foreground">Seasons</h4>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      Choose whether Sonarr should monitor every available season or only the ones you select.
                    </p>
                  </div>

                  {availableSeasons.length > 0 ? (
                    <>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <label className="flex items-start gap-3 rounded-2xl border border-line/70 bg-panel px-4 py-4 text-sm text-foreground">
                          <input
                            type="radio"
                            name="seasonSelectionMode"
                            value="all"
                            checked={seasonSelectionMode === "all"}
                            onChange={() => onSeasonSelectionModeChange("all")}
                            className="mt-1 h-4 w-4 border-line bg-panel text-accent"
                          />
                          <span>
                            <span className="block font-medium text-foreground">All available seasons</span>
                            <span className="mt-1 block text-muted">Monitor every season returned for this show.</span>
                          </span>
                        </label>

                        <label className="flex items-start gap-3 rounded-2xl border border-line/70 bg-panel px-4 py-4 text-sm text-foreground">
                          <input
                            type="radio"
                            name="seasonSelectionMode"
                            value="custom"
                            checked={seasonSelectionMode === "custom"}
                            onChange={() => onSeasonSelectionModeChange("custom")}
                            className="mt-1 h-4 w-4 border-line bg-panel text-accent"
                          />
                          <span>
                            <span className="block font-medium text-foreground">Choose specific seasons</span>
                            <span className="mt-1 block text-muted">Only monitor the seasons selected below.</span>
                          </span>
                        </label>
                      </div>

                      <fieldset
                        disabled={seasonSelectionMode !== "custom"}
                        className={`space-y-3 ${seasonSelectionMode === "custom" ? "" : "opacity-60"}`}
                      >
                        <legend className="text-sm text-muted">Available seasons</legend>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {availableSeasons.map((season) => (
                            <label
                              key={season.seasonNumber}
                              className="flex items-center gap-2 rounded-2xl border border-line/70 bg-panel px-4 py-3 text-sm text-foreground"
                            >
                              <input
                                type="checkbox"
                                name="seasonNumbers"
                                value={season.seasonNumber}
                                className="h-4 w-4 rounded border-line bg-panel text-accent"
                              />
                              <span>{season.label}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </>
                  ) : (
                    <>
                      <input type="hidden" name="seasonSelectionMode" value="all" />
                      <p className="rounded-2xl border border-line/70 bg-panel px-4 py-3 text-sm leading-6 text-muted">
                        Season choices are unavailable for this item, so Sonarr will request all available seasons.
                      </p>
                    </>
                  )}

                  {state.fieldErrors?.seasonNumbers ? (
                    <p className="text-sm text-highlight">{state.fieldErrors.seasonNumbers}</p>
                  ) : null}
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <RecommendationTagFields
                connectionSummary={connectionSummary}
                fieldErrors={state.fieldErrors}
              />
              <RecommendationAddSummaryCard>
                Recommendarr searches Sonarr by title and year, then submits the destination, season,
                and tag options you selected here.
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
            <CancelButton onClose={onClose} />
            <SubmitButton serviceLabel="Sonarr" />
          </div>
        </div>
      </form>
    </RecommendationAddModalShell>
  );
}