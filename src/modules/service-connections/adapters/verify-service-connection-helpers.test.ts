import { describe, expect, it } from "vitest";

import {
  buildAiProviderVerificationResult,
  buildLibraryManagerVerificationResult,
  buildSabnzbdVerificationResult,
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

  it("normalizes LM Studio native /api/v1/models payload using the `models` array and `key` field", () => {
    expect(
      normalizeAiProviderModelIds({
        models: [
          {
            type: "llm",
            publisher: "google",
            key: "google/gemma-4-26b-a4b",
            display_name: "Gemma 4 26B A4B",
          },
          {
            type: "llm",
            key: "deepseek-r1",
          },
          {
            type: "embedding",
            key: "text-embedding-nomic-embed-text-v1.5-embedding",
          },
        ] as never,
      }),
    ).toEqual([
      "deepseek-r1",
      "google/gemma-4-26b-a4b",
      "text-embedding-nomic-embed-text-v1.5-embedding",
    ]);
  });

  it("fails AI provider verification when the configured model is not returned", () => {
    expect(
      buildAiProviderVerificationResult({
        availableModels: ["gpt-4o", "gpt-4o-mini"],
        metadata: {
          model: "gpt-5",
        },
        flavor: "openai-compatible",
      }),
    ).toEqual({
      ok: false,
      message: 'Connected, but model "gpt-5" was not returned by the provider.',
      metadata: {
        model: "gpt-5",
        availableModels: ["gpt-4o", "gpt-4o-mini"],
        aiProviderFlavor: "openai-compatible",
      },
    });
  });

  it("includes the detected provider flavor in successful verification metadata", () => {
    expect(
      buildAiProviderVerificationResult({
        availableModels: ["google/gemma-4-26b-a4b"],
        metadata: { model: "google/gemma-4-26b-a4b" },
        flavor: "lm-studio-native",
      }),
    ).toMatchObject({
      ok: true,
      metadata: {
        aiProviderFlavor: "lm-studio-native",
        availableModels: ["google/gemma-4-26b-a4b"],
        model: "google/gemma-4-26b-a4b",
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

  it("adds matching disk space metadata to library root folders", () => {
    expect(
      normalizeLibraryManagerMetadata({
        rootFolders: [
          { path: "D:\\Media\\TV", name: "TV" },
          { path: "/mnt/library/movies", name: "Movies", freeSpace: 125_000_000_000 },
        ],
        diskSpaces: [
          { path: "D:\\", freeSpace: 600_000_000_000, totalSpace: 1_000_000_000_000 },
          { path: "/mnt", freeSpace: 450_000_000_000, totalSpace: 2_000_000_000_000 },
          { path: "/mnt/library", freeSpace: 80_000_000_000, totalSpace: 500_000_000_000 },
        ],
        qualityProfiles: [{ id: 7, name: "HD-1080p" }],
        tags: [],
      }),
    ).toEqual({
      rootFolders: [
        {
          path: "D:\\Media\\TV",
          label: "TV",
          freeSpaceBytes: 600_000_000_000,
          totalSpaceBytes: 1_000_000_000_000,
        },
        {
          path: "/mnt/library/movies",
          label: "Movies",
          freeSpaceBytes: 125_000_000_000,
          totalSpaceBytes: 500_000_000_000,
        },
      ],
      qualityProfiles: [{ id: 7, name: "HD-1080p" }],
      tags: [],
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

  it("returns a success summary for a verified SABnzbd queue", () => {
    expect(
      buildSabnzbdVerificationResult({
        version: "4.5.2",
        queueStatus: "Downloading",
        queuePaused: false,
        activeQueueCount: 2,
        speed: "12.5 M",
        timeLeft: "0:10:00",
      }),
    ).toEqual({
      ok: true,
      message: "Connected to SABnzbd 4.5.2. 2 active queue items.",
      metadata: {
        version: "4.5.2",
        queueStatus: "Downloading",
        queuePaused: false,
        activeQueueCount: 2,
        speed: "12.5 M",
        timeLeft: "0:10:00",
      },
    });
  });
});