import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
    decryptSecret: vi.fn(() => "saved-secret"),
}));
vi.mock("@/modules/service-connections/adapters/verify-service-connection", () => ({
    verifyServiceConnection: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
    findServiceConnectionByType: vi.fn(),
    updateServiceConnectionVerification: vi.fn(),
}));
vi.mock("@/modules/users/public", () => ({
    createAuditEvent: vi.fn(),
}));

import { decryptSecret } from "@/lib/security/secret-box";
import { verifyServiceConnection } from "@/modules/service-connections/adapters/verify-service-connection";
import {
    findServiceConnectionByType,
    updateServiceConnectionVerification,
} from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/public";

import { verifyConfiguredServiceConnection } from "./verify-configured-service-connection";

const decryptMock = vi.mocked(decryptSecret);
const verifyMock = vi.mocked(verifyServiceConnection);
const findMock = vi.mocked(findServiceConnectionByType);
const updateVerificationMock = vi.mocked(updateServiceConnectionVerification);
const auditMock = vi.mocked(createAuditEvent);

const RECORD = {
    connection: { id: "connection-1", baseUrl: "https://tautulli.test" },
    secret: { encryptedValue: "old-enc" },
    metadata: { availableUsers: [{ id: "user-1", name: "Tanner" }] },
};

describe("verifyConfiguredServiceConnection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        decryptMock.mockImplementation(() => "saved-secret");
        findMock.mockResolvedValue(RECORD as never);
        updateVerificationMock.mockResolvedValue(undefined as never);
        auditMock.mockResolvedValue(undefined as never);
    });

    it("verifies a readable saved credential and records the result", async () => {
        verifyMock.mockResolvedValue({ ok: true, message: "Connected." });

        const result = await verifyConfiguredServiceConnection("user-1", "tautulli");

        expect(verifyMock).toHaveBeenCalledWith({
            serviceType: "tautulli",
            baseUrl: "https://tautulli.test",
            secret: "saved-secret",
            metadata: RECORD.metadata,
        });
        expect(updateVerificationMock).toHaveBeenCalledWith(
            "connection-1",
            "verified",
            "Connected.",
            undefined,
        );
        expect(auditMock).toHaveBeenCalledWith({
            actorUserId: "user-1",
            eventType: "service-connections.verified",
            subjectType: "service-connection",
            subjectId: "tautulli",
            payloadJson: JSON.stringify({ serviceType: "tautulli", ok: true }),
        });
        expect(result).toEqual({ ok: true, message: "Tautulli: Connected." });
    });

    it("blocks legacy credential-bearing URLs before decrypting or verifying them", async () => {
        findMock.mockResolvedValue({
            ...RECORD,
            connection: {
                ...RECORD.connection,
                baseUrl: "https://tautulli.test/?token=legacy-secret",
            },
        } as never);

        const result = await verifyConfiguredServiceConnection("user-1", "tautulli");
        const auditPayload = auditMock.mock.calls[0]?.[0]?.payloadJson ?? "";

        expect(result).toEqual({
            ok: false,
            message:
                "The saved base URL contains embedded credentials. Replace it before verifying.",
            field: "baseUrl",
        });
        expect(decryptMock).not.toHaveBeenCalled();
        expect(verifyMock).not.toHaveBeenCalled();
        expect(updateVerificationMock).toHaveBeenCalledWith(
            "connection-1",
            "error",
            "The saved base URL contains embedded credentials. Replace it before verifying.",
            RECORD.metadata,
        );
        expect(auditPayload).not.toContain("legacy-secret");
        expect(auditPayload).not.toContain("tautulli.test");
    });

    it("returns an actionable error and persists error status when the saved credential is unreadable", async () => {
        decryptMock.mockImplementation(() => {
            throw new Error("Unable to decrypt secret with the configured encryption keys.");
        });

        const result = await verifyConfiguredServiceConnection("user-1", "tautulli");
        const auditPayload = auditMock.mock.calls[0]?.[0]?.payloadJson ?? "";

        expect(result).toEqual({
            ok: false,
            message: "The saved credential could not be read. Enter it again before verifying.",
            field: "apiKey",
        });
        expect(verifyMock).not.toHaveBeenCalled();
        expect(updateVerificationMock).toHaveBeenCalledWith(
            "connection-1",
            "error",
            "The saved credential could not be read. Enter it again before verifying.",
            RECORD.metadata,
        );
        expect(auditMock).toHaveBeenCalledWith({
            actorUserId: "user-1",
            eventType: "service-connections.verification-failed",
            subjectType: "service-connection",
            subjectId: "tautulli",
            payloadJson: JSON.stringify({ serviceType: "tautulli", ok: false }),
        });
        expect(auditPayload).not.toContain("old-enc");
        expect(auditPayload).not.toContain("saved-secret");
    });
});
