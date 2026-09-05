// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { connectionReturnTarget } from "@/app/(workspace)/settings/connections/connection-navigation";
import { buildStorageHealthHref, StorageOverviewView } from "./storage-overview";

afterEach(cleanup);

describe("storage waiting state", () => {
    const overview = {
        runtime: "host",
        runtimeGuidance: "Local storage.",
        approvedMediaRoots: [],
        libraryDestinations: [],
        downloadWorkspace: {
            reachable: false,
            writable: false,
            maximumNewDownloadBytes: null,
            snapshotStatus: "unavailable",
            workLocation: { effectivePath: "/work" },
            outputLocation: { effectivePath: "/output" },
            processingReservationBytes: 0,
            activeDownloadBytes: 0,
            freeSpaceBytes: null,
            totalSpaceBytes: null,
            statusMessage: "No background reading is available.",
            lastCheckedAt: null,
        },
    };

    it("does not imply a probe is active while the worker is unavailable", () => {
        render(<StorageOverviewView overview={overview as never} workerResponsive={false} />);
        expect(screen.getByText("Waiting for worker")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Check worker health" })).toHaveAttribute(
            "href",
            "/health",
        );
        expect(screen.queryByText("Checking")).not.toBeInTheDocument();
    });

    it("keeps a setup capability when opening worker health", () => {
        render(
            <StorageOverviewView
                overview={overview as never}
                workerResponsive={false}
                healthHref={buildStorageHealthHref("/setup?capability=tv")}
            />,
        );

        expect(screen.getByRole("link", { name: "Check worker health" })).toHaveAttribute(
            "href",
            "/health?returnTo=%2Fsetup%3Fcapability%3Dtv",
        );
    });

    it("uses safe health return targets and omits absent targets", () => {
        expect(buildStorageHealthHref("/settings/storage")).toBe("/health?returnTo=%2Fsetup");
        expect(buildStorageHealthHref("https://evil.test/search")).toBe(
            "/health?returnTo=%2Fsetup",
        );
        expect(buildStorageHealthHref("//evil.test/search")).toBe("/health?returnTo=%2Fsetup");
        expect(buildStorageHealthHref(undefined)).toBe("/health");
    });

    it("round-trips an encoded search request through storage and health", () => {
        const requestHref = "/search?type=tv&q=Only%20Murders%20%26%20More&sort=recent";
        const healthUrl = new URL(buildStorageHealthHref(requestHref), "http://nooklet.test");

        expect(connectionReturnTarget(healthUrl.searchParams.get("returnTo"))).toEqual({
            href: requestHref,
            label: "Back to your search",
        });
    });

    it("keeps a TV setup capability through storage and health", () => {
        const healthUrl = new URL(
            buildStorageHealthHref("/setup?capability=tv"),
            "http://nooklet.test",
        );

        expect(connectionReturnTarget(healthUrl.searchParams.get("returnTo"))).toEqual({
            href: "/setup?capability=tv",
            label: "Back to Setup Center",
        });
    });

    it("shows no reading yet rather than claiming worker failure when its state is unknown", () => {
        render(<StorageOverviewView overview={overview as never} />);
        expect(screen.getByText("No reading yet")).toBeInTheDocument();
        expect(screen.queryByText("Waiting for worker")).not.toBeInTheDocument();
    });
});
