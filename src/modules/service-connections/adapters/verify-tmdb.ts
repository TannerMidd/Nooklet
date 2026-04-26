import { verifyTmdbConnection } from "./tmdb";
import type {
  VerifyServiceConnectionInput,
  VerifyServiceConnectionResult,
} from "./verify-service-connection-types";

export async function verifyTmdb(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  return verifyTmdbConnection(input);
}