import { describe, expect, it } from "vitest";
import { connectionReturnTarget } from "./connection-navigation";

describe("connection return navigation", () => {
    it.each(["/in-progress", "/library", "/tv", "/movies", "/history", "/home"])(
        "retains the workspace task and query at %s",
        (pathname) => {
            expect(connectionReturnTarget(`${pathname}?filter=attention`).href).toBe(
                `${pathname}?filter=attention`,
            );
        },
    );

    it("retains title-search intent and setup capability", () => {
        expect(connectionReturnTarget("/search?type=tv&q=Dark")).toEqual({
            href: "/search?type=tv&q=Dark",
            label: "Back to your search",
        });
        expect(connectionReturnTarget("/setup?capability=youtube").href).toBe(
            "/setup?capability=youtube",
        );
    });

    it.each([
        "//evil.test/search",
        "/\\evil.test/search",
        "https://evil.test/search",
        "javascript:alert(1)",
        "/login",
        undefined,
    ])("rejects unsafe or unrelated destinations: %s", (value) => {
        expect(connectionReturnTarget(value).href).toBe("/setup");
    });
});
