import { describe, expect, it } from "vitest";
import { z } from "zod";

import { projectLibraryRequestFieldErrors } from "./library-request-action-helpers";

describe("library-request-action-helpers > projectLibraryRequestFieldErrors", () => {
  it("returns only the first message per field, mapping to the action state shape", () => {
    const error = new z.ZodError([
      { code: "custom", path: ["rootFolderPath"], message: "Select a root folder.", input: undefined },
      { code: "custom", path: ["rootFolderPath"], message: "second-error-ignored", input: undefined },
      { code: "custom", path: ["qualityProfileId"], message: "Select a quality profile.", input: undefined },
      { code: "custom", path: ["seasonNumbers"], message: "Select valid seasons.", input: undefined },
      { code: "custom", path: ["tagIds"], message: "Select valid tags.", input: undefined },
    ]);

    const projected = projectLibraryRequestFieldErrors(error as never);

    expect(projected).toEqual({
      rootFolderPath: "Select a root folder.",
      qualityProfileId: "Select a quality profile.",
      seasonNumbers: "Select valid seasons.",
      tagIds: "Select valid tags.",
    });
  });

  it("returns undefined entries for fields without errors", () => {
    const error = new z.ZodError([
      { code: "custom", path: ["rootFolderPath"], message: "needed", input: undefined },
    ]);

    const projected = projectLibraryRequestFieldErrors(error as never);

    expect(projected).toEqual({
      rootFolderPath: "needed",
      qualityProfileId: undefined,
      seasonNumbers: undefined,
      tagIds: undefined,
    });
  });

  it("surfaces an issue at a nested path under the top-level field name (zod flattens by first path segment)", () => {
    const error = new z.ZodError([
      { code: "custom", path: ["seasonNumbers", 1], message: "Select valid seasons.", input: undefined },
    ]);

    expect(projectLibraryRequestFieldErrors(error as never).seasonNumbers).toBe(
      "Select valid seasons.",
    );
  });
});
