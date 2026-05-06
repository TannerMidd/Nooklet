import { verifyTvdbConnection } from "./tvdb";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";
import type {
  VerifyServiceConnectionInput,
  VerifyServiceConnectionResult,
} from "./verify-service-connection-types";

export async function verifyTvdb(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  return verifyTvdbConnection({
    baseUrl: input.baseUrl,
    secret: input.secret,
    metadata: input.metadata,
    timeoutMs: SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
  });
}