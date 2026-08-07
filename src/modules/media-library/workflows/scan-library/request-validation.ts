import { z } from "zod";

export const scanMediaLibraryInputSchema = z.object({
    pathIds: z.array(z.string().uuid()).max(100).optional(),
});

export type ScanMediaLibraryInput = z.infer<typeof scanMediaLibraryInputSchema>;

export function validateScanMediaLibraryRequest(input: ScanMediaLibraryInput) {
    return scanMediaLibraryInputSchema.parse(input);
}
