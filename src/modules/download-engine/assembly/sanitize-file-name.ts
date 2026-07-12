/**
 * File names inside NZBs and yEnc headers are attacker-controlled. Reduce
 * them to a safe basename before they touch the filesystem: no path
 * separators, no traversal, no control characters, bounded length.
 */

const unsafeCharacters = new RegExp("[\\u0000-\\u001f<>:\"/\\\\|?*]", "g");
const maxFileNameLength = 200;

export function sanitizeDownloadFileName(rawName: string, fallback = "download.bin"): string {
  const baseName = rawName.split(/[/\\]/).pop() ?? "";
  const cleaned = baseName
    .replace(unsafeCharacters, "_")
    .replace(/^\.+/, "")
    .trim();

  if (!cleaned || cleaned === "." || cleaned === "..") {
    return fallback;
  }

  if (cleaned.length <= maxFileNameLength) {
    return cleaned;
  }

  // Preserve the extension when truncating an absurdly long name.
  const dotIndex = cleaned.lastIndexOf(".");
  const extension = dotIndex > 0 ? cleaned.slice(dotIndex).slice(0, 20) : "";

  return `${cleaned.slice(0, maxFileNameLength - extension.length)}${extension}`;
}
