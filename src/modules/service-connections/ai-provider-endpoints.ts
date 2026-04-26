import { trimTrailingSlash } from "@/lib/integrations/http-helpers";

export type AiProviderFlavor = "openai-compatible" | "lm-studio-native";

export const aiProviderFlavors = ["openai-compatible", "lm-studio-native"] as const;

/**
 * Read the AI-provider flavor that was persisted into connection metadata
 * during verification. Returns `null` when the connection was verified before
 * the flavor seam shipped (or the value is otherwise missing/invalid), so
 * callers can treat “flavor unknown” as a real state instead of inspecting
 * raw metadata keys.
 */
export function parseAiProviderFlavor(
  metadata: Record<string, unknown> | null,
): AiProviderFlavor | null {
  const value = metadata?.aiProviderFlavor;

  if (typeof value === "string" && (aiProviderFlavors as readonly string[]).includes(value)) {
    return value as AiProviderFlavor;
  }

  return null;
}

/**
 * Detect the on-the-wire shape of the configured AI provider from a `/models`
 * response payload.
 *
 * - OpenAI / OpenRouter / LM Studio's `/v1` endpoint return `{ data: [{ id }] }`.
 * - LM Studio's native `/api/v1/models` endpoint returns
 *   `{ models: [{ key, display_name, ... }] }`.
 *
 * If both arrays are absent or empty we fall back to `openai-compatible`,
 * since that is the broadly compatible default.
 */
export function detectAiProviderFlavor(payload: unknown): AiProviderFlavor {
  if (!payload || typeof payload !== "object") {
    return "openai-compatible";
  }

  const candidate = payload as { data?: unknown; models?: unknown };
  const hasOpenAiData = Array.isArray(candidate.data) && candidate.data.length > 0;

  if (hasOpenAiData) {
    return "openai-compatible";
  }

  if (Array.isArray(candidate.models) && candidate.models.length > 0) {
    return "lm-studio-native";
  }

  return "openai-compatible";
}

/**
 * Resolve the chat-completions URL to call for a given configured base URL
 * and detected provider flavor.
 *
 * For OpenAI-compatible providers this is simply `${baseUrl}/chat/completions`.
 *
 * LM Studio's native REST API lives at `/api/v1/*` but its OpenAI-compatible
 * chat-completions endpoint lives at `/v1/chat/completions` on the same host.
 * If the user verified against the native `/api/v1` base URL, rewrite the
 * trailing `/api/v1` segment to `/v1` so chat completions still work without
 * making them re-enter a second URL.
 */
export function resolveChatCompletionsUrl(
  baseUrl: string,
  flavor: AiProviderFlavor,
): string {
  const trimmed = trimTrailingSlash(baseUrl);

  if (flavor === "lm-studio-native") {
    const rewritten = trimmed.replace(/\/api\/v1$/, "/v1");
    return `${rewritten}/chat/completions`;
  }

  return `${trimmed}/chat/completions`;
}

/**
 * Resolve the list-models URL to call for a given configured base URL.
 * Both the OpenAI-compatible `/models` endpoint and LM Studio's native
 * `/api/v1/models` endpoint live directly under the configured base URL,
 * so verification can use the same path for both flavors.
 */
export function resolveListModelsUrl(baseUrl: string): string {
  return `${trimTrailingSlash(baseUrl)}/models`;
}
