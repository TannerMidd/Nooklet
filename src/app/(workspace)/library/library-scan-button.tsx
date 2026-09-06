"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { scanLibraryAction } from "@/app/(workspace)/library/actions";
import {
    initialScanLibraryActionState,
    type ScanLibraryActionState,
} from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";

function ScanStatus({ state }: { state: ScanLibraryActionState }) {
    if (state.status === "idle" || !state.message) {
        return null;
    }

    return (
        <InlineAlert
            variant={state.status === "success" ? "success" : "error"}
            className="px-3 py-1.5 text-xs"
        >
            {state.message}
        </InlineAlert>
    );
}

function ScanSubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" variant="secondary" disabled={pending}>
            <RefreshCw
                aria-hidden="true"
                size={16}
                className={pending ? "animate-spin" : undefined}
            />
            {pending ? "Scanning..." : "Scan library"}
        </Button>
    );
}

export function LibraryScanButton() {
    const [state, formAction] = useActionState(scanLibraryAction, initialScanLibraryActionState);

    return (
        <form action={formAction} className="flex flex-col gap-2 sm:items-end">
            <ScanSubmitButton />
            <ScanStatus state={state} />
        </form>
    );
}
