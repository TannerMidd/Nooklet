import { type WatchHistorySourceType } from "@/lib/database/schema";

export type WatchHistorySourceDefinition = {
  sourceType: WatchHistorySourceType;
  displayName: string;
  description: string;
};

export const watchHistorySourceDefinitions = [
  {
    sourceType: "manual",
    displayName: "Manual entries",
    description: "Paste watched titles directly when you want explicit control over the imported list.",
  },
  {
    sourceType: "plex",
    displayName: "Direct Plex sync",
    description: "Use a verified Plex server and token to import recent watched history directly.",
  },
  {
    sourceType: "tautulli",
    displayName: "Tautulli sync",
    description: "Use a verified Tautulli connection to import recent Plex history through Tautulli.",
  },
  {
    sourceType: "trakt",
    displayName: "Trakt sync",
    description: "Use a verified Trakt connection to import watched shows and movies from your Trakt account.",
  },
] as const satisfies readonly WatchHistorySourceDefinition[];

export function getWatchHistorySourceDefinition(sourceType: WatchHistorySourceType) {
  const definition = watchHistorySourceDefinitions.find(
    (entry) => entry.sourceType === sourceType,
  );

  if (!definition) {
    throw new Error(`Unknown watch-history source type: ${sourceType}`);
  }

  return definition;
}