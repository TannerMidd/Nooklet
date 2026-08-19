import { describe, expect, it } from "vitest";

import { withDownloadAdmissionFence } from "@/lib/download-admission";

describe("download admission fence", () => {
    it("serializes inspection-and-claim operations across runners", async () => {
        const events: string[] = [];
        let markFirstStarted!: () => void;
        const firstStarted = new Promise<void>((resolve) => {
            markFirstStarted = resolve;
        });
        let releaseFirst!: () => void;
        const firstCanFinish = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const first = withDownloadAdmissionFence(async () => {
            events.push("first-start");
            markFirstStarted();
            await firstCanFinish;
            events.push("first-claim");
        });
        const second = withDownloadAdmissionFence(async () => {
            events.push("second-start");
            events.push("second-claim");
        });

        await firstStarted;
        expect(events).toEqual(["first-start"]);
        releaseFirst();
        await Promise.all([first, second]);
        expect(events).toEqual(["first-start", "first-claim", "second-start", "second-claim"]);
    });
});
