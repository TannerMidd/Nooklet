"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

export function RefreshButton({ label = "Try again" }: { label?: string }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    return (
        <Button
            variant="secondary"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
        >
            {pending ? "Retrying…" : label}
        </Button>
    );
}
