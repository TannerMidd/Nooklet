import {
  testIndexerInputSchema,
  type TestIndexerInput,
} from "@/modules/indexers/schemas/indexer-input";

export type ValidatedTestIndexerRequest = TestIndexerInput;

export function validateTestIndexerRequest(input: TestIndexerInput): ValidatedTestIndexerRequest {
  return testIndexerInputSchema.parse(input);
}
