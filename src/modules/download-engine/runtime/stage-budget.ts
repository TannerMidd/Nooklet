/** Shared size-aware timing constants used by the runner and health diagnostics. */
export const engineStageMinimumBudgetMs = 30 * 60_000;
export const engineFetchingAssumedBytesPerSecond = 512 * 1024;
export const engineRepairAssumedBytesPerSecond = 512 * 1024;
export const engineExtractionAssumedBytesPerSecond = 1024 * 1024;
export const enginePostProcessingFixedAllowanceMs = 30 * 60_000;

function safePayloadBytes(totalBytes: number) {
    return Number.isSafeInteger(totalBytes) && totalBytes > 0 ? totalBytes : 0;
}

export function sizeAwareStageAllowanceMs(
    totalBytes: number,
    assumedBytesPerSecond: number,
    fixedAllowanceMs: number,
) {
    return (
        Math.ceil(safePayloadBytes(totalBytes) / assumedBytesPerSecond) * 1_000 + fixedAllowanceMs
    );
}

export function fetchingStageBudgetForBytes(totalBytes: number, configuredOverride?: number) {
    if (configuredOverride !== undefined) {
        return configuredOverride;
    }

    return (
        engineStageMinimumBudgetMs +
        sizeAwareStageAllowanceMs(totalBytes, engineFetchingAssumedBytesPerSecond, 0)
    );
}
