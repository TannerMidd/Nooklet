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
      "Connect the model provider that generates your recommendations.",
    secretLabel: "API key",
    modelLabel: "Default model",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  {
    serviceType: "sonarr",
    displayName: "Sonarr",
    description:
      "Connect your TV library so Recommendarr can avoid duplicates and add shows for you.",
    secretLabel: "API key",
    defaultBaseUrl: "http://localhost:8989",
  },
  {
    serviceType: "radarr",
    displayName: "Radarr",
    description:
      "Connect your movie library so Recommendarr can avoid duplicates and add movies for you.",
    secretLabel: "API key",
    defaultBaseUrl: "http://localhost:7878",
  },
  {
    serviceType: "tautulli",
    displayName: "Tautulli",
    description:
      "Import recent watches from Tautulli and choose which Plex user to follow.",
    secretLabel: "API key",
    defaultBaseUrl: "http://localhost:8181",
  },
  {
    serviceType: "plex",
    displayName: "Plex",
    description:
      "Import recent watches directly from Plex when you want to sync without Tautulli.",
    secretLabel: "X-Plex-Token",
    defaultBaseUrl: "http://localhost:32400",
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
