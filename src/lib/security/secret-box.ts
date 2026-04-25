import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

function getSecretMaterial() {
  return env.AUTH_SECRET;
}

function deriveKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const key = deriveKey(getSecretMaterial());
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encryptedValue = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), encryptedValue.toString("base64")].join(":");
}

export function decryptSecret(encryptedValue: string) {
  const [ivBase64, authTagBase64, payloadBase64] = encryptedValue.split(":");

  if (!ivBase64 || !authTagBase64 || !payloadBase64) {
    throw new Error("Invalid encrypted secret payload.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(getSecretMaterial()),
    Buffer.from(ivBase64, "base64"),
  );

  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(payloadBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSecret(value: string) {
  if (value.length <= 4) {
    return "*".repeat(Math.max(value.length, 1));
  }

  return `${value.slice(0, 2)}${"*".repeat(Math.max(value.length - 4, 4))}${value.slice(-2)}`;
}
