export type RecommendationActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<
    Record<
      "requestPrompt" | "requestedCount" | "aiModel" | "temperature" | "selectedGenres",
      string
    >
  >;
};

export const initialRecommendationActionState: RecommendationActionState = {
  status: "idle",
};

export type RecommendationRunActionState = {
  status: "idle" | "error";
  message?: string;
};

export const initialRecommendationRunActionState: RecommendationRunActionState = {
  status: "idle",
};

export type RecommendationFeedbackActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  feedback?: "like" | "dislike" | null;
};

export const initialRecommendationFeedbackActionState: RecommendationFeedbackActionState = {
  status: "idle",
  feedback: null,
};

export type RecommendationLibraryActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<
    Record<
      | "rootFolderPath"
      | "qualityProfileId"
      | "seasonNumbers"
      | "tagIds"
      | "libraryId"
      | "targetLibraryPathId"
      | "qualityProfile"
      | "monitored",
      string
    >
  >;
  /**
   * Legacy library-search requests can ask the client to transition straight
   * into the in-modal episode picker after the series is created.
   */
  pendingEpisodeSelection?: {
    sonarrSeriesId: number;
    seriesTitle: string;
    /** Recommendation item id if this came from the recommendations add flow. */
    recommendationItemId?: string;
  };
};

export const initialRecommendationLibraryActionState: RecommendationLibraryActionState = {
  status: "idle",
};

export type RecommendationEpisodeSelectionActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"episodeIds", string>>;
};

export const initialRecommendationEpisodeSelectionActionState: RecommendationEpisodeSelectionActionState = {
  status: "idle",
};
