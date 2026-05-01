/**
 * Sonarr/Radarr indexer adapter.
 *
 * Indexers (newznab, torznab, etc.) are managed inside Sonarr/Radarr — Nooklet
 * does not persist their definitions. This adapter is a thin typed wrapper over
 * the upstream `/api/v3/indexer` and `/api/v3/indexer/schema` endpoints used by
 * the Indexers tab on the library workspace.
 *
 * All requests share the existing `X-Api-Key` header pattern used by
 * `verify-library-manager.ts` and the lookup/add flows in `add-library-item.ts`.
 */

import { fetchWithTimeout, trimTrailingSlash } from "@/lib/integrations/http-helpers";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";
import { extractArrErrorMessage } from "./arr-response-helpers";
import {
  type ArrIndexerField,
  type ArrIndexerFieldSelectOption,
  type ArrIndexerProtocol,
  type ArrIndexerSchema,
  type ArrIndexerSummary,
  type ArrIndexerTestFailure,
  type ArrIndexerTestResult,
} from "@/modules/service-connections/types/arr-indexers";
import { type LibraryManagerServiceType } from "./add-library-item-helpers";

type ArrConnectionInput = {
  serviceType: LibraryManagerServiceType;
  baseUrl: string;
  apiKey: string;
};

export type ArrIndexerWritePayload = {
  id?: number;
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
  fields: Array<{ name: string; value: unknown }>;
};

export type ArrIndexerOperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function getServiceLabel(serviceType: LibraryManagerServiceType) {
  return serviceType === "sonarr" ? "Sonarr" : "Radarr";
}

function buildIndexerUrl(
  baseUrl: string,
  path: "" | "/schema" | "/test" | `/${number}`,
) {
  return `${trimTrailingSlash(baseUrl)}/api/v3/indexer${path}`;
}

function buildHeaders(apiKey: string, includeContentType: boolean) {
  const headers: Record<string, string> = {
    "X-Api-Key": apiKey,
  };

  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function readNumberField(record: Record<string, unknown>, key: string, fallback = 0) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBooleanField(record: Record<string, unknown>, key: string, fallback = false) {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function readStringField(record: Record<string, unknown>, key: string, fallback = "") {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function readNullableStringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumericTagIds(record: Record<string, unknown>): number[] {
  const value = record.tags;
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "number" && Number.isInteger(entry) ? entry : null))
    .filter((entry): entry is number => entry !== null);
}

function normalizeProtocol(value: unknown): ArrIndexerProtocol {
  if (value === "torrent" || value === "usenet") {
    return value;
  }
  return "unknown";
}

function normalizeSelectOptions(value: unknown): ArrIndexerFieldSelectOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const optionValue = record.value;
      const name = readStringField(record, "name");

      if (typeof optionValue !== "number" && typeof optionValue !== "string") {
        return null;
      }

      if (!name) {
        return null;
      }

      return { value: optionValue, name } satisfies ArrIndexerFieldSelectOption;
    })
    .filter((entry): entry is ArrIndexerFieldSelectOption => entry !== null);
}

function normalizeField(value: unknown): ArrIndexerField | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = readStringField(record, "name");

  if (!name) {
    return null;
  }

  return {
    name,
    label: readNullableStringField(record, "label"),
    helpText: readNullableStringField(record, "helpText"),
    helpLink: readNullableStringField(record, "helpLink"),
    type: readStringField(record, "type", "textbox"),
    value: record.value,
    advanced: readBooleanField(record, "advanced"),
    hidden: readBooleanField(record, "hidden"),
    selectOptions: normalizeSelectOptions(record.selectOptions),
  };
}

function normalizeFields(value: unknown): ArrIndexerField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeField(entry))
    .filter((entry): entry is ArrIndexerField => entry !== null);
}

function normalizeIndexerSummary(value: unknown): ArrIndexerSummary | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = record.id;

  if (typeof id !== "number" || !Number.isInteger(id)) {
    return null;
  }

  return {
    id,
    name: readStringField(record, "name"),
    implementation: readStringField(record, "implementation"),
    implementationName: readStringField(record, "implementationName"),
    configContract: readStringField(record, "configContract"),
    protocol: normalizeProtocol(record.protocol),
    priority: readNumberField(record, "priority", 25),
    enableRss: readBooleanField(record, "enableRss"),
    enableAutomaticSearch: readBooleanField(record, "enableAutomaticSearch"),
    enableInteractiveSearch: readBooleanField(record, "enableInteractiveSearch"),
    tags: readNumericTagIds(record),
    fields: normalizeFields(record.fields),
  };
}

function normalizeIndexerSchema(value: unknown): ArrIndexerSchema | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const implementation = readStringField(record, "implementation");

  if (!implementation) {
    return null;
  }

  return {
    implementation,
    implementationName: readStringField(record, "implementationName"),
    configContract: readStringField(record, "configContract"),
    infoLink: readNullableStringField(record, "infoLink"),
    protocol: normalizeProtocol(record.protocol),
    fields: normalizeFields(record.fields),
  };
}

function normalizeTestFailures(payload: unknown): ArrIndexerTestFailure[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const errorMessage =
        readStringField(record, "errorMessage") || readStringField(record, "message");

      if (!errorMessage) {
        return null;
      }

      return {
        propertyName: readNullableStringField(record, "propertyName"),
        errorMessage,
        severity: readNullableStringField(record, "severity"),
      } satisfies ArrIndexerTestFailure;
    })
    .filter((entry): entry is ArrIndexerTestFailure => entry !== null);
}

export async function listArrIndexers(
  input: ArrConnectionInput,
): Promise<ArrIndexerOperationResult<ArrIndexerSummary[]>> {
  try {
    const response = await fetchWithTimeout(
      buildIndexerUrl(input.baseUrl, ""),
      {
        headers: buildHeaders(input.apiKey, false),
        cache: "no-store",
      },
      SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
    );

    if (!response.ok) {
      return {
        ok: false,
        message: await extractArrErrorMessage(response, getServiceLabel(input.serviceType)),
      };
    }

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload)) {
      return {
        ok: false,
        message: `${getServiceLabel(input.serviceType)} returned an unexpected indexer payload.`,
      };
    }

    const items = payload
      .map((entry) => normalizeIndexerSummary(entry))
      .filter((entry): entry is ArrIndexerSummary => entry !== null);

    return { ok: true, value: items };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : `${getServiceLabel(input.serviceType)} indexer list failed unexpectedly.`,
    };
  }
}

export async function listArrIndexerSchemas(
  input: ArrConnectionInput,
): Promise<ArrIndexerOperationResult<ArrIndexerSchema[]>> {
  try {
    const response = await fetchWithTimeout(
      buildIndexerUrl(input.baseUrl, "/schema"),
      {
        headers: buildHeaders(input.apiKey, false),
        cache: "no-store",
      },
      SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
    );

    if (!response.ok) {
      return {
        ok: false,
        message: await extractArrErrorMessage(response, getServiceLabel(input.serviceType)),
      };
    }

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload)) {
      return {
        ok: false,
        message: `${getServiceLabel(input.serviceType)} returned an unexpected indexer schema payload.`,
      };
    }

    const items = payload
      .map((entry) => normalizeIndexerSchema(entry))
      .filter((entry): entry is ArrIndexerSchema => entry !== null);

    return { ok: true, value: items };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : `${getServiceLabel(input.serviceType)} indexer schema list failed unexpectedly.`,
    };
  }
}

export async function createArrIndexer(
  input: ArrConnectionInput & { payload: ArrIndexerWritePayload },
): Promise<ArrIndexerOperationResult<ArrIndexerSummary>> {
  try {
    const response = await fetchWithTimeout(
      buildIndexerUrl(input.baseUrl, ""),
      {
        method: "POST",
        headers: buildHeaders(input.apiKey, true),
        cache: "no-store",
        body: JSON.stringify(input.payload),
      },
      SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
    );

    if (!response.ok) {
      return {
        ok: false,
        message: await extractArrErrorMessage(response, getServiceLabel(input.serviceType)),
      };
    }

    const payload = (await response.json()) as unknown;
    const summary = normalizeIndexerSummary(payload);

    if (!summary) {
      return {
        ok: false,
        message: `${getServiceLabel(input.serviceType)} returned an unexpected indexer create payload.`,
      };
    }

    return { ok: true, value: summary };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : `${getServiceLabel(input.serviceType)} indexer create failed unexpectedly.`,
    };
  }
}

export async function updateArrIndexer(
  input: ArrConnectionInput & { id: number; payload: ArrIndexerWritePayload },
): Promise<ArrIndexerOperationResult<ArrIndexerSummary>> {
  try {
    const response = await fetchWithTimeout(
      buildIndexerUrl(input.baseUrl, `/${input.id}`),
      {
        method: "PUT",
        headers: buildHeaders(input.apiKey, true),
        cache: "no-store",
        body: JSON.stringify({ ...input.payload, id: input.id }),
      },
      SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
    );

    if (!response.ok) {
      return {
        ok: false,
        message: await extractArrErrorMessage(response, getServiceLabel(input.serviceType)),
      };
    }

    const payload = (await response.json()) as unknown;
    const summary = normalizeIndexerSummary(payload);

    if (!summary) {
      return {
        ok: false,
        message: `${getServiceLabel(input.serviceType)} returned an unexpected indexer update payload.`,
      };
    }

    return { ok: true, value: summary };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : `${getServiceLabel(input.serviceType)} indexer update failed unexpectedly.`,
    };
  }
}

export async function deleteArrIndexer(
  input: ArrConnectionInput & { id: number },
): Promise<ArrIndexerOperationResult<true>> {
  try {
    const response = await fetchWithTimeout(
      buildIndexerUrl(input.baseUrl, `/${input.id}`),
      {
        method: "DELETE",
        headers: buildHeaders(input.apiKey, false),
        cache: "no-store",
      },
      SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
    );

    if (!response.ok) {
      return {
        ok: false,
        message: await extractArrErrorMessage(response, getServiceLabel(input.serviceType)),
      };
    }

    return { ok: true, value: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : `${getServiceLabel(input.serviceType)} indexer delete failed unexpectedly.`,
    };
  }
}

export async function testArrIndexer(
  input: ArrConnectionInput & { payload: ArrIndexerWritePayload },
): Promise<ArrIndexerOperationResult<ArrIndexerTestResult>> {
  try {
    const response = await fetchWithTimeout(
      buildIndexerUrl(input.baseUrl, "/test"),
      {
        method: "POST",
        headers: buildHeaders(input.apiKey, true),
        cache: "no-store",
        body: JSON.stringify(input.payload),
      },
      SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
    );

    if (response.ok) {
      // Sonarr/Radarr return 200 + empty array on success.
      return { ok: true, value: { ok: true } };
    }

    if (response.status === 400) {
      // Validation failure: body is an array of `{ propertyName, errorMessage }`.
      const payload = (await response.json().catch(() => null)) as unknown;
      const failures = normalizeTestFailures(payload);

      if (failures.length > 0) {
        return { ok: true, value: { ok: false, failures } };
      }
    }

    return {
      ok: false,
      message: await extractArrErrorMessage(response, getServiceLabel(input.serviceType)),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : `${getServiceLabel(input.serviceType)} indexer test failed unexpectedly.`,
    };
  }
}
