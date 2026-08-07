import { z } from "zod";

export const deleteMediaTitleWithFilesInputSchema = z.object({
    titleId: z.string().uuid("Choose a library title."),
    deleteFiles: z.boolean().default(false),
});

export type DeleteMediaTitleWithFilesInput = z.infer<typeof deleteMediaTitleWithFilesInputSchema>;

export function validateDeleteMediaTitleWithFilesRequest(input: unknown) {
    return deleteMediaTitleWithFilesInputSchema.parse(input);
}
