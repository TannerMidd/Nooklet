export type ScanMediaLibraryErrorCode = "no_paths";

export class ScanMediaLibraryWorkflowError extends Error {
  constructor(
    public readonly code: ScanMediaLibraryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ScanMediaLibraryWorkflowError";
  }
}
