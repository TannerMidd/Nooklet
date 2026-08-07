export type IndexerProviderPreset = {
    id: "generic" | "nzbgeek" | "drunkenslug" | "nzbfinder";
    label: string;
    name: string;
    baseUrl: string;
    apiPath: string;
    description: string;
};

export const indexerProviderPresets: readonly IndexerProviderPreset[] = [
    {
        id: "generic",
        label: "Other Newznab provider",
        name: "",
        baseUrl: "",
        apiPath: "/api",
        description: "Use the Newznab endpoint supplied by your indexer.",
    },
    {
        id: "nzbgeek",
        label: "NZBGeek",
        name: "NZBGeek",
        baseUrl: "https://api.nzbgeek.info",
        apiPath: "/api",
        description: "Prefills NZBGeek's standard Newznab endpoint.",
    },
    {
        id: "drunkenslug",
        label: "DrunkenSlug",
        name: "DrunkenSlug",
        baseUrl: "https://drunkenslug.com",
        apiPath: "/api",
        description: "Prefills DrunkenSlug's standard Newznab endpoint.",
    },
    {
        id: "nzbfinder",
        label: "NZB Finder",
        name: "NZB Finder",
        baseUrl: "https://nzbfinder.ws",
        apiPath: "/api",
        description: "Prefills NZB Finder's standard Newznab endpoint.",
    },
];

export function getIndexerProviderPreset(id: string) {
    return indexerProviderPresets.find((preset) => preset.id === id) ?? indexerProviderPresets[0];
}
