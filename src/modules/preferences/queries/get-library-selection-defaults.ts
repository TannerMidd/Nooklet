import {
  getLibrarySelectionDefaults as getLibrarySelectionDefaultsFromRepository,
  type LibrarySelectionPreferenceDefaults,
  type LibrarySelectionPreferenceService,
  type PreferenceRecord,
} from "@/modules/preferences/repositories/preferences-repository";

export type { LibrarySelectionPreferenceDefaults, LibrarySelectionPreferenceService };

/**
 * Reads root folder + quality profile defaults for a Sonarr/Radarr-style
 * library manager from a saved preference record. Stable read seam for
 * presentation code.
 */
export function getLibrarySelectionDefaults(
  preferences: PreferenceRecord,
  serviceType: LibrarySelectionPreferenceService,
): LibrarySelectionPreferenceDefaults {
  return getLibrarySelectionDefaultsFromRepository(preferences, serviceType);
}
