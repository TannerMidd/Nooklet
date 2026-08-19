import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/identity-access/workflows/get-protected-action-session", () => ({
    getProtectedActionSession: vi.fn(),
}));
vi.mock("@/modules/youtube/public", () => ({
    disconnectYouTubeAccess: vi.fn(),
    testAndSaveYouTubeAccess: vi.fn(),
    verifySavedYouTubeAccess: vi.fn(),
    YouTubeAccessError: class YouTubeAccessError extends Error {
        field = null;
    },
    YtDlpAdapterError: class YtDlpAdapterError extends Error {
        kind = "tool_failure";
    },
}));

import { initialConnectionActionState } from "./action-state";
import { submitYouTubeAccessAction } from "./youtube-access-actions";
import { getProtectedActionSession } from "@/modules/identity-access/workflows/get-protected-action-session";
import { testAndSaveYouTubeAccess } from "@/modules/youtube/public";

const authMock = vi.mocked(getProtectedActionSession);
const saveMock = vi.mocked(testAndSaveYouTubeAccess);
const cookieFile = [
    "# Netscape HTTP Cookie File",
    ".youtube.com\tTRUE\t/\tTRUE\t0\tSAPISID\tsecret",
    "",
].join("\n");

beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } } as never);
});

describe("submitYouTubeAccessAction", () => {
    it("requires an administrator", async () => {
        authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } } as never);
        const formData = new FormData();

        formData.set("intent", "verify");

        await expect(
            submitYouTubeAccessAction(initialConnectionActionState, formData),
        ).resolves.toMatchObject({
            status: "error",
            message: expect.stringContaining("administrator"),
        });
        expect(saveMock).not.toHaveBeenCalled();
    });

    it("passes only the authenticated admin and uploaded file contents to the workflow", async () => {
        saveMock.mockResolvedValue({ cookieCount: 1 });
        const formData = new FormData();

        formData.set("intent", "test-save");
        formData.set(
            "cookiesFile",
            new File([cookieFile], "youtube-cookies.txt", { type: "text/plain" }),
        );

        await expect(
            submitYouTubeAccessAction(initialConnectionActionState, formData),
        ).resolves.toEqual({
            status: "success",
            message: "Authenticated YouTube access verified and saved (1 session cookie).",
        });
        expect(saveMock).toHaveBeenCalledWith("admin-1", cookieFile);
    });
});
