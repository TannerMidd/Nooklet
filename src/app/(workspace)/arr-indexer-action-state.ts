import { type ArrIndexerTestFailure } from "@/modules/service-connections/types/arr-indexers";

export interface ArrIndexerActionState {
  status: "idle" | "success" | "error" | "test-failed";
  message?: string;
  /**
   * Populated when status is "test-failed": upstream Sonarr/Radarr accepted
   * the request but reported per-field validation failures.
   */
  testFailures?: ArrIndexerTestFailure[];
}

export const initialArrIndexerActionState: ArrIndexerActionState = { status: "idle" };
