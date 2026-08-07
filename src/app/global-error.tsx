"use client";

import { ErrorFallback } from "@/components/ui/error-fallback";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="en">
            <body>
                <ErrorFallback error={error} reset={reset} fullPage />
            </body>
        </html>
    );
}
