export type RecommendationActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"requestPrompt" | "requestedCount", string>>;
};

export const initialRecommendationActionState: RecommendationActionState = {
  status: "idle",
};
