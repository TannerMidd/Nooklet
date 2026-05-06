import { z } from "zod";

export const scanMediaLibraryInputSchema = z.object({});

export type ScanMediaLibraryInput = z.infer<typeof scanMediaLibraryInputSchema>;

export function validateScanMediaLibraryRequest(input: ScanMediaLibraryInput) {
  return scanMediaLibraryInputSchema.parse(input);
}
