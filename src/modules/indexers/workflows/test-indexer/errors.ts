export type TestIndexerWorkflowErrorCode = "not_found" | "missing_secret" | "missing_categories";

export class TestIndexerWorkflowError extends Error {
    constructor(
        message: string,
        public readonly code: TestIndexerWorkflowErrorCode,
    ) {
        super(message);
        this.name = "TestIndexerWorkflowError";
    }
}
