import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_ALGORITHM = "scrypt";
const KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH).toString("hex");

  return `${HASH_ALGORITHM}$${salt}$${derivedKey}`;
}

export function verifyPassword(password: string, storedPasswordHash: string) {
  const [algorithm, salt, storedDerivedKey] = storedPasswordHash.split("$");

  if (algorithm !== HASH_ALGORITHM || !salt || !storedDerivedKey) {
    return false;
  }

  const actualDerivedKey = scryptSync(password, salt, KEY_LENGTH);
  const expectedDerivedKey = Buffer.from(storedDerivedKey, "hex");

  return (
    expectedDerivedKey.length === actualDerivedKey.length &&
    timingSafeEqual(expectedDerivedKey, actualDerivedKey)
  );
}
