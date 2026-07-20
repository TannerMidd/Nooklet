import { z } from "zod";

import { type SabnzbdQueueSnapshot } from "@/lib/integrations/sabnzbd";
import { type SabnzbdQueueActionInput } from "@/modules/service-connections/sabnzbd-queue-actions";
import { type ActiveSabnzbdQueueState } from "@/modules/service-connections/workflows/get-active-sabnzbd-queue";
import { type EngineQueueActionOutcome } from "@/modules/download-engine/workflows/apply-engine-queue-action";

export const downloadQueueSourceSchema = z.enum(["engine", "sabnzbd"]);

export type DownloadQueueSource = z.infer<typeof downloadQueueSourceSchema>;

export type DownloadQueueSourceState = {
  source: DownloadQueueSource;
  label: string;
  connectionStatus: ActiveSabnzbdQueueState["connectionStatus"];
  statusMessage: string;
  snapshot: SabnzbdQueueSnapshot | null;
};

/**
 * Browser-facing queue contract. The aggregate snapshot keeps badges and
 * per-title progress working, while `sources` preserves the ownership needed
 * for correct queue controls and source-local ordering.
 */
export type ActiveDownloadQueueState = ActiveSabnzbdQueueState & {
  sources: DownloadQueueSourceState[];
  action?: EngineQueueActionOutcome;
};

export type DownloadQueueActionRequest = SabnzbdQueueActionInput & {
  source: DownloadQueueSource;
};
