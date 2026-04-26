export const languagePreferenceAny = "any";

export const languagePreferenceCodes = [
  languagePreferenceAny,
  "ar",
  "da",
  "de",
  "en",
  "es",
  "fr",
  "hi",
  "it",
  "ja",
  "ko",
  "nl",
  "no",
  "pl",
  "pt",
  "sv",
  "tr",
  "zh",
] as const;

export type LanguagePreferenceCode = (typeof languagePreferenceCodes)[number];

export const languagePreferenceOptions = [
  { value: languagePreferenceAny, label: "Any language" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "hi", label: "Hindi" },
  { value: "ar", label: "Arabic" },
  { value: "nl", label: "Dutch" },
  { value: "sv", label: "Swedish" },
  { value: "da", label: "Danish" },
  { value: "no", label: "Norwegian" },
  { value: "pl", label: "Polish" },
  { value: "tr", label: "Turkish" },
] as const satisfies ReadonlyArray<{ value: LanguagePreferenceCode; label: string }>;

const languageLabelByCode = new Map(
  languagePreferenceOptions.map((option) => [option.value, option.label]),
);

export function formatLanguagePreference(value: LanguagePreferenceCode) {
  return languageLabelByCode.get(value) ?? value.toUpperCase();
}