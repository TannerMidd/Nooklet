import { describe, expect, it } from "vitest";

import {
  resolveRecommendationLibrarySelectionDefaults,
  validateRecommendationLibrarySelection,
} from "./recommendation-library-selection";

const validMetadata = {
  rootFolders: [
    {
      path: "/library/movies",
      label: "Movies",
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
      label: "recommended",
    },
  ],
};

describe("recommendation-library-selection", () => {
  it("prefers saved defaults when they still exist in the verified metadata", () => {
    expect(
      resolveRecommendationLibrarySelectionDefaults(validMetadata, {
        rootFolderPath: "/library/movies",
        qualityProfileId: 7,
      }),
    ).toEqual({
      rootFolderPath: "/library/movies",
      qualityProfileId: 7,
    });
  });

  it("falls back to the first verified destination when saved defaults are stale", () => {
    expect(
      resolveRecommendationLibrarySelectionDefaults(
        {
          rootFolders: [
            {
              path: "/library/tv",
              label: "TV",
            },
            {
              path: "/library/archive",
              label: "Archive",
            },
          ],
          qualityProfiles: [
            {
              id: 10,
              name: "Any",
            },
            {
              id: 15,
              name: "HD-1080p",
            },
          ],
        },
        {
          rootFolderPath: "/library/removed",
          qualityProfileId: 99,
        },
      ),
    ).toEqual({
      rootFolderPath: "/library/tv",
      qualityProfileId: 10,
    });
  });

  it("requires verified metadata with root folders and quality profiles", () => {
    expect(
      validateRecommendationLibrarySelection(null, {
        rootFolderPath: "/library/movies",
        qualityProfileId: 7,
        tagIds: [],
        seasonSelectionMode: "all",
        seasonNumbers: [],
      }, "Radarr"),
    ).toEqual({
      ok: false,
      message: "Re-run Radarr verification to load root folders and quality profiles.",
    });
  });

  it("rejects unknown root folders", () => {
    expect(
      validateRecommendationLibrarySelection(validMetadata, {
        rootFolderPath: "/library/other",
        qualityProfileId: 7,
        tagIds: [],
        seasonSelectionMode: "all",
        seasonNumbers: [],
      }, "Radarr"),
    ).toEqual({
      ok: false,
      message: "Select a valid root folder.",
      field: "rootFolderPath",
    });
  });

  it("rejects unknown quality profiles", () => {
    expect(
      validateRecommendationLibrarySelection(validMetadata, {
        rootFolderPath: "/library/movies",
        qualityProfileId: 99,
        tagIds: [],
        seasonSelectionMode: "all",
        seasonNumbers: [],
      }, "Radarr"),
    ).toEqual({
      ok: false,
      message: "Select a valid quality profile.",
      field: "qualityProfileId",
    });
  });

  it("rejects tags that were not returned by the verified connection", () => {
    expect(
      validateRecommendationLibrarySelection(validMetadata, {
        rootFolderPath: "/library/movies",
        qualityProfileId: 7,
        tagIds: [11, 12],
        seasonSelectionMode: "all",
        seasonNumbers: [],
      }, "Radarr"),
    ).toEqual({
      ok: false,
      message: "Select only tags returned by the verified library manager connection.",
      field: "tagIds",
    });
  });

  it("requires a season selection when a custom TV selection is requested", () => {
    expect(
      validateRecommendationLibrarySelection(
        validMetadata,
        {
          rootFolderPath: "/library/movies",
          qualityProfileId: 7,
          tagIds: [11],
          seasonSelectionMode: "custom",
          seasonNumbers: [],
        },
        "Sonarr",
        {
          mediaType: "tv",
          availableSeasonNumbers: [1, 2, 3],
        },
      ),
    ).toEqual({
      ok: false,
      message: "Select at least one season or choose all seasons.",
      field: "seasonNumbers",
    });
  });

  it("rejects unknown season numbers for custom TV selections", () => {
    expect(
      validateRecommendationLibrarySelection(
        validMetadata,
        {
          rootFolderPath: "/library/movies",
          qualityProfileId: 7,
          tagIds: [11],
          seasonSelectionMode: "custom",
          seasonNumbers: [1, 4],
        },
        "Sonarr",
        {
          mediaType: "tv",
          availableSeasonNumbers: [1, 2, 3],
        },
      ),
    ).toEqual({
      ok: false,
      message: "Select only seasons returned for this show.",
      field: "seasonNumbers",
    });
  });

  it("accepts valid custom TV season selections", () => {
    expect(
      validateRecommendationLibrarySelection(
        validMetadata,
        {
          rootFolderPath: "/library/movies",
          qualityProfileId: 7,
          tagIds: [11],
          seasonSelectionMode: "custom",
          seasonNumbers: [1, 3],
        },
        "Sonarr",
        {
          mediaType: "tv",
          availableSeasonNumbers: [1, 2, 3],
        },
      ),
    ).toEqual({
      ok: true,
    });
  });

  it("accepts valid selections", () => {
    expect(
      validateRecommendationLibrarySelection(validMetadata, {
        rootFolderPath: "/library/movies",
        qualityProfileId: 7,
        tagIds: [11],
        seasonSelectionMode: "all",
        seasonNumbers: [],
      }, "Radarr"),
    ).toEqual({
      ok: true,
    });
  });
});