/**
 * Content sniffing for downloaded files. Usenet posts routinely ship with
 * obfuscated, extensionless file names (anti-takedown), so finalization must
 * identify PAR2 sets, archives, and media by magic bytes — never by name.
 */

export type DetectedFileKind =
  | { kind: "par2"; extension: ".par2" }
  | { kind: "rar"; extension: ".rar" }
  | { kind: "zip"; extension: ".zip" }
  | { kind: "7z"; extension: ".7z" }
  | { kind: "video"; extension: ".mkv" | ".mp4" | ".avi" | ".wmv" }
  | { kind: "unknown"; extension: null };

function startsWith(buffer: Buffer, bytes: number[], offset = 0) {
  if (buffer.length < offset + bytes.length) {
    return false;
  }

  for (let index = 0; index < bytes.length; index += 1) {
    if (buffer[offset + index] !== bytes[index]) {
      return false;
    }
  }

  return true;
}

/** Detects a file kind from its first bytes (16 bytes are sufficient). */
export function detectFileKind(header: Buffer): DetectedFileKind {
  // "PAR2\0PKT"
  if (startsWith(header, [0x50, 0x41, 0x52, 0x32, 0x00, 0x50, 0x4b, 0x54])) {
    return { kind: "par2", extension: ".par2" };
  }

  // "Rar!\x1a\x07" covers RAR4 (\x00) and RAR5 (\x01\x00) signatures.
  if (startsWith(header, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) {
    return { kind: "rar", extension: ".rar" };
  }

  // "PK\x03\x04"
  if (startsWith(header, [0x50, 0x4b, 0x03, 0x04])) {
    return { kind: "zip", extension: ".zip" };
  }

  // "7z\xbc\xaf\x27\x1c"
  if (startsWith(header, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return { kind: "7z", extension: ".7z" };
  }

  // EBML → Matroska/WebM
  if (startsWith(header, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { kind: "video", extension: ".mkv" };
  }

  // ISO base media: "ftyp" at offset 4 → mp4/m4v/mov family
  if (startsWith(header, [0x66, 0x74, 0x79, 0x70], 4)) {
    return { kind: "video", extension: ".mp4" };
  }

  // "RIFF"...."AVI "
  if (
    startsWith(header, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(header, [0x41, 0x56, 0x49, 0x20], 8)
  ) {
    return { kind: "video", extension: ".avi" };
  }

  // ASF/WMV GUID
  if (startsWith(header, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])) {
    return { kind: "video", extension: ".wmv" };
  }

  return { kind: "unknown", extension: null };
}
