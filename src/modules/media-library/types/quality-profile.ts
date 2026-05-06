import { type MediaQualityProfile } from "@/lib/database/schema";

export const mediaQualityProfileOptions = [
  { value: "any", label: "Any quality" },
  { value: "hd-720p", label: "HD 720p" },
  { value: "hd-1080p", label: "HD 1080p" },
  { value: "uhd-2160p", label: "UHD 2160p" },
] as const satisfies ReadonlyArray<{ value: MediaQualityProfile; label: string }>;

export function getMediaQualityProfileLabel(value: MediaQualityProfile) {
  return mediaQualityProfileOptions.find((profile) => profile.value === value)?.label ?? value;
}
