import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

function digest(value: string) {
    return createHash("sha256").update(value, "utf8").digest();
}

export function isWebBootstrapConfigured() {
    return Boolean(env.BOOTSTRAP_TOKEN);
}

/** Compare fixed-size digests so invalid token lengths do not leak timing. */
export function verifyBootstrapToken(candidate: string) {
    if (!env.BOOTSTRAP_TOKEN) {
        return false;
    }

    return timingSafeEqual(digest(candidate), digest(env.BOOTSTRAP_TOKEN));
}
