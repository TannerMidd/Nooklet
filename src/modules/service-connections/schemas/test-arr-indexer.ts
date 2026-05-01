import { z } from "zod";

import {
  arrIndexerFieldInputSchema,
  arrIndexerProtocolSchema,
  libraryManagerServiceTypeSchema,
} from "./save-arr-indexer";

/**
 * Same body as save-arr-indexer minus the optional id and returnTo, since
 * test calls do not mutate state and are not invoked through a redirecting
 * form action.
 */
export const arrIndexerTestSchema = z.object({
  serviceType: libraryManagerServiceTypeSchema,
  name: z.string().trim().min(1, "Indexer name is required."),
  implementation: z.string().trim().min(1),
  implementationName: z.string().trim().min(1),
  configContract: z.string().trim().min(1),
  protocol: arrIndexerProtocolSchema,
  priority: z.coerce.number().int().min(1).max(50).default(25),
  enableRss: z.coerce.boolean().default(true),
  enableAutomaticSearch: z.coerce.boolean().default(true),
  enableInteractiveSearch: z.coerce.boolean().default(true),
  tags: z.array(z.coerce.number().int().nonnegative()).default([]),
  fields: z.array(arrIndexerFieldInputSchema).default([]),
});

export type ArrIndexerTestInput = z.infer<typeof arrIndexerTestSchema>;
