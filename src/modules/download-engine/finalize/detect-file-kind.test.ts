import { describe, expect, it } from "vitest";

import { detectFileKind } from "@/modules/download-engine/finalize/detect-file-kind";

function header(bytes: number[], pad = 16) {
    return Buffer.concat([Buffer.from(bytes), Buffer.alloc(Math.max(0, pad - bytes.length))]);
}

describe("detectFileKind", () => {
    it("detects PAR2 packets", () => {
        expect(detectFileKind(header([0x50, 0x41, 0x52, 0x32, 0x00, 0x50, 0x4b, 0x54]))).toEqual({
            kind: "par2",
            extension: ".par2",
        });
    });

    it("detects RAR4 and RAR5 volumes", () => {
        expect(detectFileKind(header([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])).kind).toBe("rar");
        expect(detectFileKind(header([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])).kind).toBe(
            "rar",
        );
    });

    it("detects Matroska video", () => {
        expect(detectFileKind(header([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86]))).toEqual({
            kind: "video",
            extension: ".mkv",
        });
    });

    it("detects MP4 via ftyp at offset 4", () => {
        expect(
            detectFileKind(
                header([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
            ),
        ).toEqual({
            kind: "video",
            extension: ".mp4",
        });
    });

    it("detects AVI (RIFF + AVI )", () => {
        expect(
            detectFileKind(
                header([0x52, 0x49, 0x46, 0x46, 0x11, 0x22, 0x33, 0x44, 0x41, 0x56, 0x49, 0x20]),
            ),
        ).toEqual({ kind: "video", extension: ".avi" });
    });

    it("detects zip and 7z archives", () => {
        expect(detectFileKind(header([0x50, 0x4b, 0x03, 0x04])).kind).toBe("zip");
        expect(detectFileKind(header([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])).kind).toBe("7z");
    });

    it("returns unknown for unrecognized content", () => {
        expect(detectFileKind(header([0x00, 0x01, 0x02, 0x03])).kind).toBe("unknown");
        expect(detectFileKind(Buffer.alloc(0)).kind).toBe("unknown");
    });
});
