import { describe, expect, it } from "vitest";

import {
  buildAiProviderVerificationResult,
  buildLibraryManagerVerificationResult,
  normalizeAiProviderModelIds,
  normalizeLibraryManagerMetadata,
} from "./verify-service-connection-helpers";

describe("verify-service-connection-helpers", () => {
  it("normalizes AI provider model ids by trimming, deduping, and sorting", () => {
    expect(
      normalizeAiProviderModelIds({
        data: [
          { id: " gpt-4o " },
          { id: "gpt-4o-mini" },
          { id: "gpt-4o" },
          {},
          { id: "   " },
        ],
      }),
    ).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("fails AI provider verification when the configured model is not returned", () => {
    expect(
      buildAiProviderVerificationResult({
        availableModels: ["gpt-4o", "gpt-4o-mini"],
        metadata: {
          model: "gpt-5",
        },
      }),
    ).toEqual({
      ok: false,
      message: 'Connected, but model "gpt-5" was not returned by the provider.',
      metadata: {
        model: "gpt-5",
        availableModels: ["gpt-4o", "gpt-4o-mini"],
      },
    });
  });

  it("normalizes library manager metadata and drops invalid entries", () => {
    expect(
      normalizeLibraryManagerMetadata({
        rootFolders: [
          { path: " /tv ", name: " TV " },
          { path: "", name: "Missing path" },
        ],
        qualityProfiles: [
          { id: 7, name: " HD-1080p " },
          { id: 8, name: "   " },
        ],
        tags: [
          { id: 11, label: " Recommended " },
          { label: "Missing id" },
        ],
      }),
    ).toEqual({
      rootFolders: [
        {
          path: "/tv",
          label: "TV",
        },
      ],
      qualityProfiles: [
        {
          id: 7,
          name: "HD-1080p",
        },
      ],
      tags: [
        {
          id: 11,
          label: "Recommended",
        },
      ],
    });
  });

  it("fails library manager verification when required metadata is missing", () => {
    expect(
      buildLibraryManagerVerificationResult({
        rootFolders: [],
        qualityProfiles: [{ id: 7, name: "HD-1080p" }],
        tags: [],
      }),
    ).toEqual({
      ok: false,
      message: "Connected, but no root folders were returned by the library manager.",
    });
  });

  it("returns a success summary when library metadata is complete", () => {
    expect(
      buildLibraryManagerVerificationResult({
        rootFolders: [{ path: "/tv", label: "TV" }],
        qualityProfiles: [{ id: 7, name: "HD-1080p" }],
        tags: [{ id: 11, label: "Recommended" }],
      }),
    ).toEqual({
      ok: true,
      message: "Connected. Loaded 1 root folders, 1 quality profiles, and 1 tags.",
      metadata: {
        rootFolders: [{ path: "/tv", label: "TV" }],
        qualityProfiles: [{ id: 7, name: "HD-1080p" }],
        tags: [{ id: 11, label: "Recommended" }],
      },
    });
  });
});