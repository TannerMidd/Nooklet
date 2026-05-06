import {
  requestMediaTitleCommand,
} from "@/modules/media-library/commands/request-media-title";

import { type RequestTitleWithReleaseSearchInput } from "./request-validation";

export async function requestWorkflowMediaTitle(
  userId: string,
  request: RequestTitleWithReleaseSearchInput,
) {
  return requestMediaTitleCommand(userId, request);
}
