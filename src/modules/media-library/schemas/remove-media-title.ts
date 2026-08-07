import { z } from "zod";

export const removeMediaTitleInputSchema = z.object({
    titleId: z.string().uuid("Choose a library title."),
});

export type RemoveMediaTitleInput = z.infer<typeof removeMediaTitleInputSchema>;
