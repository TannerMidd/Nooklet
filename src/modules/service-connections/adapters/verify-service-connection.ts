import { type ServiceConnectionType } from "@/lib/database/schema";

type VerifyServiceConnectionInput = {
  serviceType: ServiceConnectionType;
  baseUrl: string;
  secret: string;
  metadata: Record<string, unknown> | null;
};

type VerifyServiceConnectionResult = {
  ok: boolean;
  message: string;
};

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function trimTrailingSlash(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

async function verifyAiProvider(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  const response = await fetchWithTimeout(`${trimTrailingSlash(input.baseUrl)}/models`, {
    headers: {
      Authorization: `Bearer ${input.secret}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      ok: false,
      message: `AI provider verification failed with status ${response.status}.`,
    };
  }

  const payload = (await response.json()) as { data?: Array<{ id?: string }> };
  const configuredModel =
    typeof input.metadata?.model === "string" ? (input.metadata.model as string) : null;

  if (configuredModel) {
    const modelExists = payload.data?.some((entry) => entry.id === configuredModel) ?? false;

    if (!modelExists) {
      return {
        ok: false,
        message: `Connected, but model \"${configuredModel}\" was not returned by the provider.`,
      };
    }
  }

  return {
    ok: true,
    message: configuredModel
      ? `Connected. Model \"${configuredModel}\" is available.`
      : "Connected.",
  };
}

async function verifyLibraryManager(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  const response = await fetchWithTimeout(
    `${trimTrailingSlash(input.baseUrl)}/api/v3/system/status`,
    {
      headers: {
        "X-Api-Key": input.secret,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return {
      ok: false,
      message: `Verification failed with status ${response.status}.`,
    };
  }

  return {
    ok: true,
    message: "Connected.",
  };
}

export async function verifyServiceConnection(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  try {
    switch (input.serviceType) {
      case "ai-provider":
        return await verifyAiProvider(input);
      case "sonarr":
      case "radarr":
        return await verifyLibraryManager(input);
      default:
        return {
          ok: false,
          message: "Unsupported service type.",
        };
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Connection verification failed unexpectedly.",
    };
  }
}
