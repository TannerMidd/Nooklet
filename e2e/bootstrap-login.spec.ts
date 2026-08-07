import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const axeSource = readFileSync(
    path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
    "utf8",
);

async function expectNoSeriousAccessibilityViolations(page: Page) {
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => {
        const result = await window.axe.run(document, {
            resultTypes: ["violations"],
        });

        return result.violations
            .filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))
            .map((violation) => ({
                id: violation.id,
                impact: violation.impact,
                description: violation.description,
                nodes: violation.nodes.map((node) => ({
                    target: node.target,
                    html: node.html,
                    failureSummary: node.failureSummary,
                })),
            }));
    });

    expect(violations).toEqual([]);
}

function isAuthSessionCookie(name: string) {
    return /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/.test(name);
}

declare global {
    interface Window {
        axe: typeof import("axe-core");
    }
}

test("first administrator can bootstrap, sign in, and reach the workspace", async ({
    context,
    page,
}) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/bootstrap$/);
    await expect(page.getByRole("heading", { name: "First things first." })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    await page
        .getByLabel("Setup token")
        .fill("e2e-bootstrap-token-generated-only-for-tests-0000003");
    await page.getByLabel("Display name").fill("E2E Admin");
    await page.getByLabel("Email").fill("admin@nooklet.test");
    await page.getByLabel(/^Password/).fill("E2e-Nooklet-Password-42");
    await page.getByLabel("Confirm password").fill("E2e-Nooklet-Password-42");
    await page.getByRole("button", { name: "Create administrator" }).click();

    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole("heading", { name: "Setup Center" })).toBeVisible();
    await expect(page.getByText("admin@nooklet.test")).toBeVisible();

    const signedInSessionCookies = (await context.cookies()).filter(({ name }) =>
        isAuthSessionCookie(name),
    );

    expect(signedInSessionCookies.length).toBeGreaterThan(0);
    expect(signedInSessionCookies.every(({ httpOnly }) => httpOnly)).toBe(true);

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    await context.addCookies(signedInSessionCookies);
    const queueResponse = await page.request.get("/api/downloads/queue");

    expect(queueResponse.status()).toBe(401);

    // Restore the revoked cookie again in case the API response expired it. This
    // independently proves that the page boundary rejects the same stale session.
    await context.addCookies(signedInSessionCookies);
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fhome$/);
    await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
    await page.getByLabel("Email").fill("admin@nooklet.test");
    await page.getByLabel("Password").fill("E2e-Nooklet-Password-42");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "Welcome back, E2E" })).toBeVisible();
    await expect(
        page.getByRole("navigation", { name: "Workspace navigation" }).first(),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
});
