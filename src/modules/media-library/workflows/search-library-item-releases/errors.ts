export class SearchLibraryItemReleasesWorkflowError extends Error {
  constructor(
    public readonly code:
      | "title_not_found"
      | "season_not_found"
      | "season_title_mismatch"
      | "episode_not_found"
      | "episode_title_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "SearchLibraryItemReleasesWorkflowError";
  }
}
