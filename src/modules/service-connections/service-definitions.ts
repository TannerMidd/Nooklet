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
        description: "Connect the model provider that generates your recommendations.",
        secretLabel: "API key",
        modelLabel: "Default model",
        defaultBaseUrl: "https://api.openai.com/v1",
    },
    {
        serviceType: "tautulli",
        displayName: "Tautulli",
        description: "Import recent watches from Tautulli and choose which Plex user to follow.",
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
    {
        serviceType: "usenet-server",
        displayName: "Usenet server",
        description: "The built-in downloader fetches releases directly from your news provider.",
        secretLabel: "Server credentials",
        defaultBaseUrl: "nntps://news.example.com:563",
    },
    {
        serviceType: "tmdb",
        displayName: "TMDB",
        description:
            "Connect The Movie Database for title overviews, artwork, genres, and strict original-language checks.",
        secretLabel: "API key or read token",
        defaultBaseUrl: "https://api.themoviedb.org/3",
    },
    {
        serviceType: "tvdb",
        displayName: "TVDB",
        description:
            "Connect TheTVDB for TV series identity, seasons, episodes, and release metadata.",
        secretLabel: "API key",
        defaultBaseUrl: "https://api4.thetvdb.com/v4",
    },
    {
        serviceType: "trakt",
        displayName: "Trakt",
        description:
            "Import watched TV and movies from Trakt using a client id plus OAuth access token.",
        secretLabel: "OAuth credentials",
        defaultBaseUrl: "https://api.trakt.tv",
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
