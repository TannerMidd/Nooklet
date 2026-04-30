import {
  formatLanguagePreference,
  languagePreferenceCodes,
  type LanguagePreferenceCode,
} from "@/modules/preferences/language-preferences";

export function formatRuntime(minutes: number | null | undefined) {
  if (!minutes) {
    return null;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
}

export function formatOriginalLanguage(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const normalizedValue = value.toLowerCase();

  return languagePreferenceCodes.includes(normalizedValue as LanguagePreferenceCode)
    ? formatLanguagePreference(normalizedValue as LanguagePreferenceCode)
    : value.toUpperCase();
}

export function TitleOverviewFact({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-lg border border-line/70 bg-panel-strong/60 px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-sm leading-6 text-foreground">{value ?? "Unknown"}</p>
    </div>
  );
}
