import { type RecommendationLibraryActionState } from "@/app/(workspace)/recommendation-action-state";

export type SonarrLibraryActionState = RecommendationLibraryActionState;

export const initialSonarrLibraryActionState: SonarrLibraryActionState = {
  status: "idle",
};
