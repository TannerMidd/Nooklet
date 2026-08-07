import { z } from "zod";

import { requestMediaTitleInputSchema } from "@/modules/media-library/schemas/request-media-title";

export const requestTitleWithReleaseSearchInputSchema = requestMediaTitleInputSchema.extend({
    downloadNow: z.boolean().default(false),
});

export type RequestTitleWithReleaseSearchInput = z.infer<
    typeof requestTitleWithReleaseSearchInputSchema
>;

export function validateRequestTitleWithReleaseSearchRequest(input: unknown) {
    return requestTitleWithReleaseSearchInputSchema.parse(input);
}
