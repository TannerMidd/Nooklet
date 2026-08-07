import { type MediaQualityProfile } from "@/lib/database/schema";

export type ReleaseQualitySource = {
    title: string;
    qualityLabel: string | null;
};

export type DetectedReleaseQuality = "hd-720p" | "hd-1080p" | "uhd-2160p" | "hd" | null;

export function releaseText(result: ReleaseQualitySource) {
    return `${result.title} ${result.qualityLabel ?? ""}`.toLowerCase();
}

export function detectReleaseQuality(result: ReleaseQualitySource): DetectedReleaseQuality {
    const text = releaseText(result);

    if (/\b(2160p|2160|uhd|4k|3840[ ._-]?x[ ._-]?2160)\b/.test(text)) {
        return "uhd-2160p";
    }

    if (/\b(1080p|1080i|1080|full[ ._-]?hd|fhd|1920[ ._-]?x[ ._-]?1080)\b/.test(text)) {
        return "hd-1080p";
    }

    if (/\b(720p|720|1280[ ._-]?x[ ._-]?720)\b/.test(text)) {
        return "hd-720p";
    }

    if (/\b(hd|high[ ._-]?definition)\b/.test(text)) {
        return "hd";
    }

    return null;
}

export function releaseMatchesQualityProfile(
    qualityProfile: MediaQualityProfile,
    result: ReleaseQualitySource,
) {
    if (qualityProfile === "any") {
        return true;
    }

    const detectedQuality = detectReleaseQuality(result);

    return (
        detectedQuality === qualityProfile ||
        (detectedQuality === "hd" && qualityProfile === "hd-1080p")
    );
}
