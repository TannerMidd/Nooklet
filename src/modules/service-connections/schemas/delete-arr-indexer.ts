import { z } from "zod";

import { libraryManagerServiceTypeSchema } from "./save-arr-indexer";

export const deleteArrIndexerSchema = z.object({
  serviceType: libraryManagerServiceTypeSchema,
  id: z.coerce.number().int().positive("Provide a valid indexer id."),
  returnTo: z.string().trim().min(1),
});

export type DeleteArrIndexerInput = z.infer<typeof deleteArrIndexerSchema>;
