const defaultCallbackUrl = "/home";
const localOrigin = "http://nooklet.local";

export function safeCallbackUrl(value: unknown): string {
    if (typeof value !== "string" || value.length === 0 || !value.startsWith("/")) {
        return defaultCallbackUrl;
    }

    try {
        const url = new URL(value, localOrigin);

        if (url.origin !== localOrigin) {
            return defaultCallbackUrl;
        }

        if (
            url.pathname === "/login" ||
            url.pathname.startsWith("/login/") ||
            url.pathname === "/bootstrap" ||
            url.pathname.startsWith("/bootstrap/")
        ) {
            return defaultCallbackUrl;
        }

        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return defaultCallbackUrl;
    }
}
