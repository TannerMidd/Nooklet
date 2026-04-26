import { type RecommendationLibraryActionState } from "@/app/(workspace)/recommendation-action-state";

export type RadarrLibraryActionState = RecommendationLibraryActionState;

export const initialRadarrLibraryActionState: RadarrLibraryActionState = {
  status: "idle",
};
