import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/identity-access/workflows/get-protected-action-session", () => ({
    getProtectedActionSession: vi.fn(),
}));
vi.mock("@/modules/youtube/public", () => ({
    configureYouTubeAutomation: vi.fn(),
    runYouTubeSyncNow: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { getProtectedActionSession } from "@/modules/identity-access/workflows/get-protected-action-session";
import { configureYouTubeAutomation, runYouTubeSyncNow } from "@/modules/youtube/public";

import { runYouTubeSyncNowAction, updateYouTubeSyncScheduleAction } from "./youtube-actions";

const authMock = vi.mocked(getProtectedActionSession);
const configureMock = vi.mocked(configureYouTubeAutomation);
const runNowMock = vi.mocked(runYouTubeSyncNow);
const revalidateMock = vi.mocked(revalidatePath);
const idleState = { status: "idle" as const, message: null };

beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
        user: { id: "admin-1", role: "admin" },
    } as never);
    configureMock.mockResolvedValue({} as never);
    runNowMock.mockResolvedValue({} as never);
});

describe("YouTube automation actions", () => {
    it("saves the shared schedule within the supported bounds", async () => {
        const formData = new FormData();

        formData.set("enabled", "on");
        formData.set("intervalMinutes", "360");

        const result = await updateYouTubeSyncScheduleAction(idleState, formData);

        expect(configureMock).toHaveBeenCalledWith("admin-1", {
            enabled: true,
            scheduleMinutes: 360,
        });
        expect(revalidateMock).toHaveBeenCalledWith("/settings/automation");
        expect(result.status).toBe("success");
    });

    it("rejects an out-of-bounds schedule before persistence", async () => {
        const formData = new FormData();

        formData.set("intervalMinutes", "14");

        const result = await updateYouTubeSyncScheduleAction(idleState, formData);

        expect(configureMock).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            status: "error",
            fieldErrors: { intervalMinutes: expect.any(String) },
        });
    });

    it("prevents non-admin users from changing or running the shared schedule", async () => {
        authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } } as never);
        const formData = new FormData();

        formData.set("intervalMinutes", "360");

        const saveResult = await updateYouTubeSyncScheduleAction(idleState, formData);
        const runResult = await runYouTubeSyncNowAction(idleState);

        expect(saveResult.message).toMatch(/administrator/i);
        expect(runResult.message).toMatch(/administrator/i);
        expect(configureMock).not.toHaveBeenCalled();
        expect(runNowMock).not.toHaveBeenCalled();
    });

    it("queues an isolated run-now job for an administrator", async () => {
        const result = await runYouTubeSyncNowAction(idleState);

        expect(runNowMock).toHaveBeenCalledWith("admin-1");
        expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
        expect(result.status).toBe("success");
    });
});
