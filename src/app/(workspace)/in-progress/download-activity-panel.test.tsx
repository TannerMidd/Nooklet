// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: navigation.refresh }),
}));
vi.mock("@/app/(workspace)/in-progress/actions", () => ({
    cancelSeasonFulfillmentAction: vi.fn(),
    resumeSeasonFulfillmentAction: vi.fn(),
    retryCompletedDownloadImportAction: vi.fn(),
    retryDownloadRequestAction: vi.fn(),
    runDownloadImportNowAction: vi.fn(),
}));

import { ActivityAutoRefresh } from "./download-activity-panel";

describe("ActivityAutoRefresh", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        navigation.refresh.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("uses the supplied fast interval for active transfer updates", () => {
        render(<ActivityAutoRefresh intervalMs={2_000} />);

        act(() => vi.advanceTimersByTime(1_999));
        expect(navigation.refresh).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(1));
        expect(navigation.refresh).toHaveBeenCalledTimes(1);

        act(() => vi.advanceTimersByTime(4_000));
        expect(navigation.refresh).toHaveBeenCalledTimes(3);
    });
});
