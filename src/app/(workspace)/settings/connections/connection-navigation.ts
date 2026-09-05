export function connectionReturnTarget(value: unknown) {
    const fallback = { href: "/setup", label: "Back to Setup Center" };

    if (typeof value !== "string" || !value.startsWith("/")) {
        return fallback;
    }

    try {
        const url = new URL(value, "http://nooklet.local");

        if (url.origin !== "http://nooklet.local") {
            return fallback;
        }

        const labels: Record<string, string> = {
            "/search": "Back to your search",
            "/discover": "Back to Discover",
            "/setup": fallback.label,
            "/in-progress": "Back to Activity",
            "/library": "Back to Library",
            "/tv": "Back to TV picks",
            "/movies": "Back to Movie picks",
            "/history": "Back to History",
            "/home": "Back to Home",
        };
        const label = labels[url.pathname];

        return label ? { href: `${url.pathname}${url.search}`, label } : fallback;
    } catch {
        return fallback;
    }
}
