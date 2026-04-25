import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

const HKDF_INFO = "recommendarr/secret-box/v1";
const HKDF_SALT = "recommendarr-secret-box-salt";
const ENVELOPE_VERSION = "v1";

function getKeyMaterial() {
  // Prefer a dedicated SECRET_BOX_KEY so the encryption key is decoupled from the
  // JWT signing key. Fall back to AUTH_SECRET (HKDF-derived) for backward compatibility.
  return env.SECRET_BOX_KEY ?? env.AUTH_SECRET;
}

function deriveKey(material: string): Buffer {
  const derived = hkdfSync("sha256", material, HKDF_SALT, HKDF_INFO, 32);
  return Buffer.from(derived);
}

function legacyDeriveKey(material: string): Buffer {
  return createHash("sha256").update(material).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const key = deriveKey(getKeyMaterial());
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encryptedValue = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encryptedValue.toString("base64"),
  ].join(":");
}

function decryptWithKey(
  ivBase64: string,
  authTagBase64: string,
  payloadBase64: string,
  key: Buffer,
) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(payloadBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptSecret(encryptedValue: string) {
  const segments = encryptedValue.split(":");

  // Versioned envelope: vN:iv:tag:ct
  if (segments.length === 4) {
    const [version, ivBase64, authTagBase64, payloadBase64] = segments;

    if (version !== ENVELOPE_VERSION) {
      throw new Error(`Unsupported secret envelope version: ${version}`);
    }

    return decryptWithKey(
      ivBase64!,
      authTagBase64!,
      payloadBase64!,
      deriveKey(getKeyMaterial()),
    );
  }

  // Legacy envelope (pre-versioned): iv:tag:ct, derived from AUTH_SECRET via raw SHA-256.
  if (segments.length === 3) {
    const [ivBase64, authTagBase64, payloadBase64] = segments;
    return decryptWithKey(
      ivBase64!,
      authTagBase64!,
      payloadBase64!,
      legacyDeriveKey(env.AUTH_SECRET),
    );
  }

  throw new Error("Invalid encrypted secret payload.");
}

export function maskSecret(value: string) {
  if (value.length <= 4) {
    return "*".repeat(Math.max(value.length, 1));
  }

  return `${value.slice(0, 2)}${"*".repeat(Math.max(value.length - 4, 4))}${value.slice(-2)}`;
}
