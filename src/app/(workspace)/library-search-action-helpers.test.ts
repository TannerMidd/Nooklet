import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  parseLibrarySearchActionFormData,
  projectLibrarySearchFieldErrors,
} from "./library-search-action-helpers";
import { projectLibraryRequestFieldErrors } from "./library-request-action-helpers";

describe("library-search-action-helpers", () => {
  it("parses a complete, valid library search form into a typed input", () => {
    const formData = new FormData();
    formData.set("serviceType", "sonarr");
    formData.set("title", "  The Show ");
    formData.set("year", "2020");
    formData.append("availableSeasonNumbers", "1");
    formData.append("availableSeasonNumbers", "2");
    formData.set("rootFolderPath", "/tv");
    formData.set("qualityProfileId", "5");
    formData.set("seasonSelectionMode", "custom");
    formData.append("seasonNumbers", "1");
    formData.append("seasonNumbers", "2");
    formData.append("tagIds", "10");
    formData.set("returnTo", "/library/sonarr");

    const result = parseLibrarySearchActionFormData(formData);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.data).toMatchObject({
      serviceType: "sonarr",
      title: "The Show",
      year: 2020,
      availableSeasonNumbers: [1, 2],
      rootFolderPath: "/tv",
      qualityProfileId: 5,
      seasonSelectionMode: "custom",
      seasonNumbers: [1, 2],
      tagIds: [10],
      returnTo: "/library/sonarr",
    });
  });

  it("treats an empty year string as null and defaults seasonSelectionMode to 'all'", () => {
    const formData = new FormData();
    formData.set("serviceType", "radarr");
    formData.set("title", "Movie X");
    formData.set("year", "");
    formData.set("rootFolderPath", "/movies");
    formData.set("qualityProfileId", "1");
    formData.set("returnTo", "/library/radarr");

    const result = parseLibrarySearchActionFormData(formData);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.data.year).toBeNull();
    expect(result.data.seasonSelectionMode).toBe("all");
    expect(result.data.seasonNumbers).toEqual([]);
    expect(result.data.tagIds).toEqual([]);
  });

  it("rejects an empty title with the user-facing 'Choose a title' message", () => {
    const formData = new FormData();
    formData.set("serviceType", "sonarr");
    formData.set("title", "   ");
    formData.set("rootFolderPath", "/tv");
    formData.set("qualityProfileId", "1");
    formData.set("returnTo", "/library/sonarr");

    const result = parseLibrarySearchActionFormData(formData);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    const flat = result.error.flatten().fieldErrors;
    expect(flat.title?.[0]).toBe("Choose a title to request.");
  });

  it("delegates field-error projection to projectLibraryRequestFieldErrors", () => {
    const error = new z.ZodError([
      {
        code: "custom",
        path: ["rootFolderPath"],
        message: "Select a root folder.",
        input: undefined,
      },
      {
        code: "custom",
        path: ["qualityProfileId"],
        message: "Select a quality profile.",
        input: undefined,
      },
      {
        code: "custom",
        path: ["seasonNumbers"],
        message: "Select valid seasons.",
        input: undefined,
      },
      {
        code: "custom",
        path: ["tagIds"],
        message: "Select valid tags.",
        input: undefined,
      },
    ]);

    expect(projectLibrarySearchFieldErrors(error as never)).toEqual(
      projectLibraryRequestFieldErrors(error as never),
    );
  });
});
