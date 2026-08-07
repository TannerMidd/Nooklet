import {
    getMediaQualityProfileLabel,
    mediaQualityProfileOptions,
} from "@/modules/media-library/types/quality-profile";

export { getMediaQualityProfileLabel };

export type MediaQualityProfileOption = (typeof mediaQualityProfileOptions)[number];

export function listMediaQualityProfiles() {
    return mediaQualityProfileOptions;
}
