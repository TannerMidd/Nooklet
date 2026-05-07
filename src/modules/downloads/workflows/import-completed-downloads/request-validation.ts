import { z } from "zod";

export const importCompletedDownloadsInputSchema = z.object({
  historyLimit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ImportCompletedDownloadsInput = z.input<typeof importCompletedDownloadsInputSchema>;
export type ImportCompletedDownloadsRequest = z.output<typeof importCompletedDownloadsInputSchema>;

export function validateImportCompletedDownloadsRequest(
  input: ImportCompletedDownloadsInput = {},
): ImportCompletedDownloadsRequest {
  return importCompletedDownloadsInputSchema.parse(input);
}
