import { describe, expect, it } from "vitest";

import {
    passwordResetConfirmation,
    roleChangeConfirmation,
    statusChangeConfirmation,
} from "./user-management-copy";

describe("managed-user confirmation copy", () => {
    it("explains the instance-wide access granted to an administrator", () => {
        const confirmation = roleChangeConfirmation("Taylor", "user", "admin");

        expect(confirmation).toMatchObject({
            tone: "warning",
            confirmLabel: "Grant administrator access",
        });
        expect(confirmation?.description).toContain("shared connections");
    });

    it("does not ask for confirmation when the role is unchanged", () => {
        expect(roleChangeConfirmation("Taylor", "user", "user")).toBeNull();
    });

    it("makes session impact explicit for account and password changes", () => {
        expect(statusChangeConfirmation("Taylor", true).description).toContain("sessions");
        expect(passwordResetConfirmation("Taylor").description).toContain("invalidates");
    });
});
