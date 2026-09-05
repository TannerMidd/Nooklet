import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/logger", () => ({
    logger: { warn: vi.fn() },
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
    createAuditEvent: vi.fn(),
}));

import { logger } from "@/lib/observability/logger";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import {
    describeWatchHistorySyncError,
    recordWatchHistorySyncAudit,
} from "./watch-history-sync-audit";

const auditMock = vi.mocked(createAuditEvent);
const warnMock = vi.mocked(logger.warn);

describe("watch-history sync audit diagnostics", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("keeps only safe error identity when audit persistence fails", async () => {
        auditMock.mockRejectedValueOnce(new Error("SQLITE constraint token=secret-value"));

        await recordWatchHistorySyncAudit({
            actorUserId: "user-1",
            eventType: "watch-history.sync.succeeded",
            subjectType: "watch-history-source",
            subjectId: "source-1",
            payloadJson: "{}",
        });

        expect(warnMock).toHaveBeenCalledWith("watch_history_sync_audit_failed", {
            eventType: "watch-history.sync.succeeded",
            subjectId: "source-1",
            error: { name: "Error" },
        });
        expect(JSON.stringify(warnMock.mock.calls[0])).not.toContain("secret-value");
        expect(JSON.stringify(warnMock.mock.calls[0])).not.toContain("SQLITE constraint");
    });

    it("retains a short diagnostic code without retaining the error message", () => {
        const error = Object.assign(new Error("database token=secret-value"), {
            code: "SQLITE_BUSY",
        });

        expect(describeWatchHistorySyncError(error)).toEqual({
            name: "Error",
            code: "SQLITE_BUSY",
        });
    });
});
