import { describe, expect, it } from "vitest";

import { crc32, crc32Final, crc32Of } from "@/modules/download-engine/yenc/crc32";

describe("crc32", () => {
    it("matches the IEEE reference vector for '123456789'", () => {
        expect(crc32Of(Buffer.from("123456789", "ascii"))).toBe(0xcbf43926);
    });

    it("produces the empty-input identity", () => {
        expect(crc32Of(Buffer.alloc(0))).toBe(0);
    });

    it("streams across chunk boundaries identically to one-shot", () => {
        const payload = Buffer.from("the quick brown fox jumps over the lazy dog", "ascii");
        const oneShot = crc32Of(payload);

        let streamed = crc32(payload.subarray(0, 10));

        streamed = crc32(payload.subarray(10, 25), streamed);
        streamed = crc32(payload.subarray(25), streamed);

        expect(crc32Final(streamed)).toBe(oneShot);
    });
});
