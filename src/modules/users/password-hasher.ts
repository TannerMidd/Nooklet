import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const HASH_ALGORITHM = "scrypt";
const HASH_VERSION = "2";
const KEY_LENGTH = 64;
// OWASP's 32 MiB scrypt profile. p=3 raises CPU cost while keeping each
// libuv worker's memory bounded for small self-hosted systems.
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 3;
const MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(
    password: string,
    salt: string,
    options?: { N: number; r: number; p: number; maxmem: number },
) {
    return new Promise<Buffer>((resolve, reject) => {
        const callback = (error: Error | null, derivedKey: Buffer) => {
            if (error) {
                reject(error);
            } else {
                resolve(derivedKey);
            }
        };

        if (options) {
            scrypt(password, salt, KEY_LENGTH, options, callback);
        } else {
            // Legacy hashes used Node's defaults (N=2^14, r=8, p=1).
            scrypt(password, salt, KEY_LENGTH, callback);
        }
    });
}

export async function hashPassword(password: string) {
    const salt = randomBytes(16).toString("hex");
    const derivedKey = await deriveKey(password, salt, {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELIZATION,
        maxmem: MAX_MEMORY,
    });

    return [
        HASH_ALGORITHM,
        HASH_VERSION,
        COST,
        BLOCK_SIZE,
        PARALLELIZATION,
        salt,
        derivedKey.toString("hex"),
    ].join("$");
}

export function passwordHashNeedsUpgrade(storedPasswordHash: string) {
    const [algorithm, version, cost, blockSize, parallelization] = storedPasswordHash.split("$");

    return !(
        algorithm === HASH_ALGORITHM &&
        version === HASH_VERSION &&
        cost === String(COST) &&
        blockSize === String(BLOCK_SIZE) &&
        parallelization === String(PARALLELIZATION)
    );
}

export async function verifyPassword(password: string, storedPasswordHash: string) {
    const parts = storedPasswordHash.split("$");
    let salt: string;
    let storedDerivedKey: string;
    let options: { N: number; r: number; p: number; maxmem: number } | undefined;

    if (parts.length === 3 && parts[0] === HASH_ALGORITHM) {
        // Backward-compatible verification for pre-v2 accounts.
        [, salt = "", storedDerivedKey = ""] = parts;
    } else if (
        parts.length === 7 &&
        parts[0] === HASH_ALGORITHM &&
        parts[1] === HASH_VERSION &&
        parts[2] === String(COST) &&
        parts[3] === String(BLOCK_SIZE) &&
        parts[4] === String(PARALLELIZATION)
    ) {
        salt = parts[5] ?? "";
        storedDerivedKey = parts[6] ?? "";
        options = {
            N: COST,
            r: BLOCK_SIZE,
            p: PARALLELIZATION,
            maxmem: MAX_MEMORY,
        };
    } else {
        return false;
    }

    if (!/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(storedDerivedKey)) {
        return false;
    }

    try {
        const actualDerivedKey = await deriveKey(password, salt, options);
        const expectedDerivedKey = Buffer.from(storedDerivedKey, "hex");

        return (
            expectedDerivedKey.length === actualDerivedKey.length &&
            timingSafeEqual(expectedDerivedKey, actualDerivedKey)
        );
    } catch {
        return false;
    }
}
