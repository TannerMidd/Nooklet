import { describe, expect, it } from "vitest";

import { classifySessionAccess } from "./session-access";

describe("classifySessionAccess", () => {
    it("classifies missing sessions and missing user payloads as anonymous", () => {
        expect(classifySessionAccess(null)).toBe("anonymous");
        expect(classifySessionAccess({})).toBe("anonymous");
    });

    it("requires a password change only when the live session flag is true", () => {
        expect(classifySessionAccess({ user: { mustChangePassword: true } })).toBe(
            "password_change_required",
        );
        expect(classifySessionAccess({ user: { mustChangePassword: false } })).toBe("ready");
        expect(classifySessionAccess({ user: {} })).toBe("ready");
    });
});
