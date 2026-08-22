import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "./map-with-concurrency";

describe("mapWithConcurrency", () => {
    it("returns results in input order regardless of completion order", async () => {
        const result = await mapWithConcurrency([80, 5, 120, 1], 4, async (delay) => {
            await new Promise((resolve) => setTimeout(resolve, delay));

            return delay;
        });

        expect(result).toEqual([80, 5, 120, 1]);
    });

    it("never exceeds the concurrency limit", async () => {
        let inFlight = 0;
        let peak = 0;

        await mapWithConcurrency(
            Array.from({ length: 12 }, (_, index) => index),
            3,
            async () => {
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                await new Promise((resolve) => setTimeout(resolve, 2));
                inFlight -= 1;
            },
        );

        expect(peak).toBe(3);
    });

    it("resolves an empty array without invoking the worker", async () => {
        let calls = 0;

        const result = await mapWithConcurrency([], 4, async (value: number) => {
            calls += 1;

            return value;
        });

        expect(result).toEqual([]);
        expect(calls).toBe(0);
    });

    it("processes every item exactly once when the limit exceeds the item count", async () => {
        const seen: number[] = [];

        const result = await mapWithConcurrency([1, 2], 8, async (value) => {
            seen.push(value);

            return value * 10;
        });

        expect(seen.sort()).toEqual([1, 2]);
        expect(result).toEqual([10, 20]);
    });

    it("invokes the worker for undefined items", async () => {
        const seen: Array<number | undefined> = [];

        const result = await mapWithConcurrency<number | undefined, number>(
            [1, undefined, 3],
            2,
            async (value) => {
                seen.push(value);

                return value ?? 0;
            },
        );

        expect(seen).toHaveLength(3);
        expect(seen).toContain(undefined);
        expect(result).toEqual([1, 0, 3]);
    });

    it("rejects invalid concurrency limits", async () => {
        for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            await expect(mapWithConcurrency([1], limit, async (value) => value)).rejects.toThrow(
                "Concurrency limit must be a positive integer.",
            );
        }
    });

    it("stops scheduling new items after the first rejection and rethrows", async () => {
        const attempted: number[] = [];

        await expect(
            mapWithConcurrency([1, 2, 3, 4, 5], 1, async (value) => {
                attempted.push(value);

                if (value === 2) {
                    throw new Error("boom on 2");
                }

                return value;
            }),
        ).rejects.toThrow("boom on 2");

        // Limit 1 makes scheduling deterministic: nothing after the failure
        // is attempted, so no external-API cost is paid past the outcome.
        expect(attempted).toEqual([1, 2]);
    });
});
