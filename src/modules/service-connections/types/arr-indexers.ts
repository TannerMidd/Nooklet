/**
 * Shared Sonarr/Radarr indexer types.
 *
 * Indexers themselves live in Sonarr/Radarr — this module only mirrors the
 * shapes returned by `/api/v3/indexer` and `/api/v3/indexer/schema` so the
 * UI can render them and round-trip mutations without inventing its own
 * normalized representation.
 */

export type ArrIndexerProtocol = "torrent" | "usenet" | "unknown";

export type ArrIndexerFieldSelectOption = {
  value: number | string;
  name: string;
};

export type ArrIndexerField = {
  name: string;
  label: string | null;
  helpText: string | null;
  helpLink: string | null;
  type: string;
  value: unknown;
  advanced: boolean;
  hidden: boolean;
  selectOptions: ArrIndexerFieldSelectOption[];
};

export type ArrIndexerSummary = {
  id: number;
  name: string;
  implementation: string;
  implementationName: string;
  configContract: string;
  protocol: ArrIndexerProtocol;
  priority: number;
  enableRss: boolean;
  enableAutomaticSearch: boolean;
  enableInteractiveSearch: boolean;
  tags: number[];
  fields: ArrIndexerField[];
};

export type ArrIndexerSchema = {
  implementation: string;
  implementationName: string;
  configContract: string;
  infoLink: string | null;
  protocol: ArrIndexerProtocol;
  fields: ArrIndexerField[];
};

export type ArrIndexerTestFailure = {
  propertyName: string | null;
  errorMessage: string;
  severity: string | null;
};

export type ArrIndexerTestResult =
  | { ok: true }
  | { ok: false; failures: ArrIndexerTestFailure[] };
