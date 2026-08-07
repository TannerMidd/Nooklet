import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
    decryptSecret: vi.fn(() => "saved-secret"),
    encryptSecret: vi.fn((value: string) => `enc(${value})`),
    maskSecret: vi.fn((value: string) => `mask(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/verify-service-connection", () => ({
    verifyServiceConnection: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
    findServiceConnectionByType: vi.fn(),
    saveServiceConnection: vi.fn(),
    updateServiceConnectionVerification: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
    createAuditEvent: vi.fn(),
}));

import { verifyServiceConnection } from "@/modules/service-connections/adapters/verify-service-connection";
import {
    findServiceConnectionByType,
    saveServiceConnection,
    updateServiceConnectionVerification,
} from "@/modules/service-connections/repositories/service-connection-repository";

import { testAndSaveServiceConnection } from "./test-and-save-service-connection";

const findMock = vi.mocked(findServiceConnectionByType);
const saveMock = vi.mocked(saveServiceConnection);
const updateVerificationMock = vi.mocked(updateServiceConnectionVerification);
const verifyMock = vi.mocked(verifyServiceConnection);

describe("testAndSaveServiceConnection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        findMock.mockResolvedValue({
            connection: { id: "connection-1", baseUrl: "https://working.example.test" },
            secret: { encryptedValue: "encrypted-saved-secret" },
            metadata: null,
        } as never);
    });

    it("does not replace a working connection when draft verification fails", async () => {
        verifyMock.mockResolvedValue({ ok: false, message: "Connection refused." });

        const result = await testAndSaveServiceConnection("user-1", {
            serviceType: "tautulli",
            baseUrl: "https://broken.example.test",
            apiKey: "new-secret",
        });

        expect(result).toEqual({
            ok: false,
            message: "Connection refused. Your previously saved connection was not changed.",
        });
        expect(saveMock).not.toHaveBeenCalled();
        expect(updateVerificationMock).not.toHaveBeenCalled();
    });

    it("persists verified draft values and retains the saved secret when no replacement is entered", async () => {
        verifyMock.mockResolvedValue({
            ok: true,
            message: "Connected.",
            metadata: { availableUsers: ["Tanner"] },
        });
        saveMock.mockResolvedValue({ connection: { id: "connection-1" } } as never);

        const result = await testAndSaveServiceConnection("user-1", {
            serviceType: "tautulli",
            baseUrl: "https://working.example.test",
            apiKey: "",
        });

        expect(verifyMock).toHaveBeenCalledWith(
            expect.objectContaining({ secret: "saved-secret" }),
        );
        expect(saveMock).toHaveBeenCalledWith(
            expect.objectContaining({
                status: "verified",
                secretUpdate: undefined,
            }),
        );
        expect(updateVerificationMock).toHaveBeenCalledWith(
            "connection-1",
            "verified",
            "Connected.",
            { availableUsers: ["Tanner"] },
        );
        expect(result).toEqual({ ok: true, message: "Tautulli connected and saved." });
    });
});
