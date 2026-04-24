import { type ServiceConnectionType } from "@/lib/database/schema";

export type ServiceConnectionDefinition = {
  serviceType: ServiceConnectionType;
  displayName: string;
  description: string;
  secretLabel: string;
  modelLabel?: string;
  defaultBaseUrl: string;
};

export const serviceConnectionDefinitions = [
  {
    serviceType: "ai-provider",
    displayName: "AI provider",
    description:
      "OpenAI-compatible provider used for recommendation generation and model execution.",
    secretLabel: "API key",
    modelLabel: "Default model",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  {
    serviceType: "sonarr",
    displayName: "Sonarr",
    description:
      "TV library manager used for add-to-library actions and existing-title checks.",
    secretLabel: "API key",
    defaultBaseUrl: "http://localhost:8989",
  },
  {
    serviceType: "radarr",
    displayName: "Radarr",
    description:
      "Movie library manager used for add-to-library actions and duplicate suppression.",
    secretLabel: "API key",
    defaultBaseUrl: "http://localhost:7878",
  },
] as const satisfies readonly ServiceConnectionDefinition[];

export function getServiceConnectionDefinition(
  serviceType: ServiceConnectionType,
): ServiceConnectionDefinition {
  const definition = serviceConnectionDefinitions.find(
    (entry) => entry.serviceType === serviceType,
  );

  if (!definition) {
    throw new Error(`Unknown service connection type: ${serviceType}`);
  }

  return definition;
}
