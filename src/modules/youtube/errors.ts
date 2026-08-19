export type YouTubeDomainErrorCode =
    | "invalid_url"
    | "invalid_request"
    | "source_exists"
    | "source_not_found"
    | "video_not_found"
    | "download_not_found"
    | "destination_not_found"
    | "destination_unavailable"
    | "enumeration_incomplete"
    | "rate_limited"
    | "not_retryable"
    | "cancelled";

export class YouTubeDomainError extends Error {
    constructor(
        message: string,
        public readonly code: YouTubeDomainErrorCode,
    ) {
        super(message);
        this.name = "YouTubeDomainError";
    }
}

export type YtDlpErrorKind =
    | "invalid_url"
    | "malformed_output"
    | "output_too_large"
    | "timeout"
    | "cancelled"
    | "authentication_required"
    | "rate_limited"
    | "network"
    | "private"
    | "removed"
    | "live"
    | "short"
    | "unavailable"
    | "tool_missing"
    | "tool_failure";

export class YtDlpAdapterError extends Error {
    constructor(
        message: string,
        public readonly kind: YtDlpErrorKind,
        public readonly exitCode: number | null = null,
    ) {
        super(message);
        this.name = "YtDlpAdapterError";
    }
}
