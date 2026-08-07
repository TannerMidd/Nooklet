import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { env } from "@/lib/env";

export function buildRateLimitKey(namespace: string, value: string) {
    const digest = createHmac("sha256", env.AUTH_SECRET).update(value, "utf8").digest("hex");

    return `${namespace}:${digest}`;
}

/** Only trust forwarding headers when an operator explicitly enables them. */
export function trustedClientAddressFromHeaders(headers: Pick<Headers, "get">) {
    if (!env.TRUST_PROXY_HEADERS) {
        return null;
    }

    const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const candidate = forwarded || headers.get("x-real-ip")?.trim();

    return candidate && isIP(candidate) !== 0 ? candidate : null;
}

export function trustedClientAddress(request: Request) {
    return trustedClientAddressFromHeaders(request.headers);
}
