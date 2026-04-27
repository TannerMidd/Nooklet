import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/http-helpers", () => ({
  fetchJsonWithTimeout: vi.fn(),
  trimTrailingSlash: (value: string) => value.replace(/\/+$/, ""),
}));

import { fetchJsonWithTimeout } from "@/lib/integrations/http-helpers";

import { verifyLibraryManager } from "./verify-library-manager";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";
import type { VerifyServiceConnectionInput } from "./verify-service-connection-types";

const fetchJsonMock = vi.mocked(fetchJsonWithTimeout);

function buildInput(overrides: Partial<VerifyServiceConnectionInput> = {}): VerifyServiceConnectionInput {
  return {
    serviceType: "sonarr",
    baseUrl: "https://sonarr.test",
    secret: "lib-api-key",
    metadata: null,
    ...overrides,
  };
}

const HEALTHY_ROOT_FOLDERS = [
  { path: "/tv", name: "TV" },
  { path: "/anime", name: "Anime" },
];
const HEALTHY_QUALITY_PROFILES = [
  { id: 1, name: "HD-1080p" },
  { id: 2, name: "Any" },
];
const HEALTHY_TAGS = [
  { id: 11, label: "kids" },
  { id: 12, label: "watched" },
];

function mockHealthyResponses() {
  fetchJsonMock.mockImplementation(async (url) => {
    const target = String(url);
    if (target.endsWith("/system/status")) return { version: "4.0.0" } as never;
    if (target.endsWith("/rootfolder")) return HEALTHY_ROOT_FOLDERS as never;
    if (target.endsWith("/qualityprofile")) return HEALTHY_QUALITY_PROFILES as never;
    if (target.endsWith("/tag")) return HEALTHY_TAGS as never;
    throw new Error(`unexpected url: ${target}`);
  });
}

describe("verifyLibraryManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hits all four endpoints with the X-Api-Key header on the configured base URL", async () => {
    mockHealthyResponses();

    await verifyLibraryManager(buildInput());

    expect(fetchJsonMock).toHaveBeenCalledTimes(4);
    const calledUrls = fetchJsonMock.mock.calls.map((call) => String(call[0])).sort();
    expect(calledUrls).toEqual([
      "https://sonarr.test/api/v3/qualityprofile",
      "https://sonarr.test/api/v3/rootfolder",
      "https://sonarr.test/api/v3/system/status",
      "https://sonarr.test/api/v3/tag",
    ]);

    for (const [, init, timeout] of fetchJsonMock.mock.calls) {
      expect(init).toMatchObject({
        cache: "no-store",
        headers: { "X-Api-Key": "lib-api-key" },
      });
      expect(timeout).toBe(SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS);
    }
  });

  it("trims a trailing slash from the configured base URL", async () => {
    mockHealthyResponses();

    await verifyLibraryManager(buildInput({ baseUrl: "https://sonarr.test/" }));

    const calledUrls = fetchJsonMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.every((url) => url.startsWith("https://sonarr.test/api/"))).toBe(true);
    expect(calledUrls.every((url) => !url.includes("//api"))).toBe(true);
  });

  it("hits system/status before issuing the metadata fan-out so an outage fails fast", async () => {
    let statusResolved = false;
    fetchJsonMock.mockImplementation(async (url) => {
      const target = String(url);
      if (target.endsWith("/system/status")) {
        statusResolved = true;
        return {} as never;
      }
      // If this branch fires before /system/status resolved, the implementation
      // is no longer probing readiness first.
      if (!statusResolved) {
        throw new Error("metadata endpoints called before /system/status resolved");
      }
      if (target.endsWith("/rootfolder")) return HEALTHY_ROOT_FOLDERS as never;
      if (target.endsWith("/qualityprofile")) return HEALTHY_QUALITY_PROFILES as never;
      if (target.endsWith("/tag")) return HEALTHY_TAGS as never;
      throw new Error(`unexpected url: ${target}`);
    });

    const result = await verifyLibraryManager(buildInput());
    expect(result.ok).toBe(true);
  });

  it("returns success with normalized metadata when all probes succeed", async () => {
    mockHealthyResponses();

    const result = await verifyLibraryManager(buildInput());

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/2 root folders, 2 quality profiles, and 2 tags/);
    expect(result.metadata).toEqual({
      rootFolders: [
        { path: "/tv", label: "TV" },
        { path: "/anime", label: "Anime" },
      ],
      qualityProfiles: [
        { id: 1, name: "HD-1080p" },
        { id: 2, name: "Any" },
      ],
      tags: [
        { id: 11, label: "kids" },
        { id: 12, label: "watched" },
      ],
    });
  });

  it("filters out malformed root folders, quality profiles, and tags rather than failing", async () => {
    fetchJsonMock.mockImplementation(async (url) => {
      const target = String(url);
      if (target.endsWith("/system/status")) return {} as never;
      if (target.endsWith("/rootfolder"))
        return [
          { path: "/tv", name: "TV" }, // valid
          { path: "", name: "Empty" }, // dropped
          { path: "/extra" }, // missing name -> falls back to path as label
          { name: "no path" }, // dropped
        ] as never;
      if (target.endsWith("/qualityprofile"))
        return [
          { id: 1, name: "HD" }, // valid
          { id: 2, name: "  " }, // dropped (empty)
          { name: "no id" }, // dropped
          { id: "3", name: "string id" }, // dropped (id not a number)
        ] as never;
      if (target.endsWith("/tag"))
        return [
          { id: 9, label: "watched" }, // valid
          { label: "no id" }, // dropped
          { id: 10, label: "" }, // dropped
        ] as never;
      throw new Error(`unexpected url: ${target}`);
    });

    const result = await verifyLibraryManager(buildInput());

    expect(result.ok).toBe(true);
    expect(result.metadata).toEqual({
      rootFolders: [
        { path: "/tv", label: "TV" },
        { path: "/extra", label: "/extra" },
      ],
      qualityProfiles: [{ id: 1, name: "HD" }],
      tags: [{ id: 9, label: "watched" }],
    });
  });

  it("fails when no root folders are configured (Sonarr/Radarr cannot ingest without one)", async () => {
    fetchJsonMock.mockImplementation(async (url) => {
      const target = String(url);
      if (target.endsWith("/system/status")) return {} as never;
      if (target.endsWith("/rootfolder")) return [] as never;
      if (target.endsWith("/qualityprofile")) return HEALTHY_QUALITY_PROFILES as never;
      if (target.endsWith("/tag")) return HEALTHY_TAGS as never;
      throw new Error(`unexpected url: ${target}`);
    });

    const result = await verifyLibraryManager(buildInput());

    expect(result).toEqual({
      ok: false,
      message: "Connected, but no root folders were returned by the library manager.",
    });
  });

  it("fails when no quality profiles are configured", async () => {
    fetchJsonMock.mockImplementation(async (url) => {
      const target = String(url);
      if (target.endsWith("/system/status")) return {} as never;
      if (target.endsWith("/rootfolder")) return HEALTHY_ROOT_FOLDERS as never;
      if (target.endsWith("/qualityprofile")) return [] as never;
      if (target.endsWith("/tag")) return HEALTHY_TAGS as never;
      throw new Error(`unexpected url: ${target}`);
    });

    const result = await verifyLibraryManager(buildInput());

    expect(result).toEqual({
      ok: false,
      message: "Connected, but no quality profiles were returned by the library manager.",
    });
  });

  it("succeeds when no tags are configured (tags are optional in Sonarr/Radarr)", async () => {
    fetchJsonMock.mockImplementation(async (url) => {
      const target = String(url);
      if (target.endsWith("/system/status")) return {} as never;
      if (target.endsWith("/rootfolder")) return HEALTHY_ROOT_FOLDERS as never;
      if (target.endsWith("/qualityprofile")) return HEALTHY_QUALITY_PROFILES as never;
      if (target.endsWith("/tag")) return [] as never;
      throw new Error(`unexpected url: ${target}`);
    });

    const result = await verifyLibraryManager(buildInput());

    expect(result.ok).toBe(true);
    expect(result.metadata?.tags).toEqual([]);
  });

  it("translates a thrown Error into a failure result with the message preserved", async () => {
    fetchJsonMock.mockImplementation(async () => {
      throw new Error("HTTP 401 Unauthorized");
    });

    const result = await verifyLibraryManager(buildInput());

    expect(result).toEqual({
      ok: false,
      message: "HTTP 401 Unauthorized",
    });
  });

  it("never includes the X-Api-Key secret in the failure message", async () => {
    fetchJsonMock.mockImplementation(async () => {
      throw new Error("HTTP 401 Unauthorized");
    });

    const result = await verifyLibraryManager(buildInput({ secret: "do-not-leak-this-key" }));

    expect(result.ok).toBe(false);
    expect(result.message).not.toContain("do-not-leak-this-key");
    expect(JSON.stringify(result)).not.toContain("do-not-leak-this-key");
  });

  it("translates a non-Error throw into a stable generic failure message", async () => {
    fetchJsonMock.mockImplementation(async () => {
      throw "plain string with key=lib-api-key";
    });

    const result = await verifyLibraryManager(buildInput());

    expect(result).toEqual({
      ok: false,
      message: "Connection verification failed unexpectedly.",
    });
    expect(result.message).not.toContain("lib-api-key");
  });
});
