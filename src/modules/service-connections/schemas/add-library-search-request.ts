import { z } from "zod";

import { libraryRequestSelectionFields } from "./library-request-selection";

const librarySearchRequestYearSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === "string" && value.trim().length === 0) {
      return null;
    }

    return value;
  },
  z.coerce.number().int("Use a whole-number year.").positive("Use a valid year.").nullable(),
);

export const addLibrarySearchRequestSchema = z.object({
  serviceType: z.enum(["sonarr", "radarr"]),
  title: z.string().trim().min(1, "Choose a title to request."),
  year: librarySearchRequestYearSchema,
  availableSeasonNumbers: z.array(z.coerce.number().int().nonnegative()).default([]),
  ...libraryRequestSelectionFields,
});

export type AddLibrarySearchRequestInput = z.infer<typeof addLibrarySearchRequestSchema>;