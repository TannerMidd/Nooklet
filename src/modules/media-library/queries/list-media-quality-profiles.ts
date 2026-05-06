import {
  getMediaQualityProfileLabel,
  mediaQualityProfileOptions,
} from "@/modules/media-library/types/quality-profile";

export { getMediaQualityProfileLabel };

export function listMediaQualityProfiles() {
  return mediaQualityProfileOptions;
}
