import type { NextConfig } from "next";

// Security response headers applied to every route. Inline scripts/styles are
// currently required by Next.js hydration; eval is permitted only by the local
// development compiler and is never included in production responses.
const scriptSource =
    process.env.NODE_ENV === "development"
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'";

const contentSecurityPolicy = [
    "default-src 'self'",
    scriptSource,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self' https://www.youtube-nocookie.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
].join("; ");

const securityHeaders = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const standaloneTraceExcludes = [
    "**/.env*",
    "data/**/*.db*",
    "secrets/**/*",
    "*.key",
    "*.pem",
    "*.p12",
    "coverage/**/*",
    "docs/**/*",
    ".git/**/*",
    ".claude/**/*",
    ".codex-tmp/**/*",
    "src/**/*",
    "vitest.config.*",
    "vitest.setup.*",
];

const nextConfig: NextConfig = {
    reactStrictMode: true,
    // Local browser tests bind the dev server to the loopback address. Next's
    // development asset guard otherwise rejects hydration requests even though
    // the page and assets never leave the host.
    ...(process.env.NODE_ENV === "development"
        ? { allowedDevOrigins: ["127.0.0.1", "localhost"] }
        : {}),
    // Emit a self-contained Node.js server bundle under .next/standalone for the
    // Docker runtime stage. See Dockerfile for how this is consumed.
    output: "standalone",
    // The migrator resolves these files from process.cwd() at runtime, so they
    // must be traced explicitly. Conversely, local state and source-only
    // artifacts must never hitch a ride in a deployable standalone bundle.
    outputFileTracingIncludes: {
        "/*": ["./drizzle/**/*"],
    },
    outputFileTracingExcludes: {
        "/*": standaloneTraceExcludes,
        // Shared server/instrumentation traces are not route names and therefore
        // do not match the global route glob above.
        "next-server": standaloneTraceExcludes,
    },
    async headers() {
        return [
            {
                source: "/:path*",
                headers: securityHeaders,
            },
        ];
    },
};

export default nextConfig;
