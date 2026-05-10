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
};

export const initialRecommendationLibraryActionState: RecommendationLibraryActionState = {
  status: "idle",
};
