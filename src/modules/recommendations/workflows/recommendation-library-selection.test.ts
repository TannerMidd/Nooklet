import { describe, expect, it } from "vitest";

import { validateRecommendationLibrarySelection } from "./recommendation-library-selection";

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
  it("requires verified metadata with root folders and quality profiles", () => {
    expect(
      validateRecommendationLibrarySelection(null, {
        rootFolderPath: "/library/movies",
        qualityProfileId: 7,
        tagIds: [],
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
      }, "Radarr"),
    ).toEqual({
      ok: false,
      message: "Select only tags returned by the verified library manager connection.",
      field: "tagIds",
    });
  });

  it("accepts valid selections", () => {
    expect(
      validateRecommendationLibrarySelection(validMetadata, {
        rootFolderPath: "/library/movies",
        qualityProfileId: 7,
        tagIds: [11],
      }, "Radarr"),
    ).toEqual({
      ok: true,
    });
  });
});