"use client";

import { Star } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { setDefaultDownloadPathAction } from "@/app/(workspace)/library/actions";
import { initialDefaultDownloadPathActionState } from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StatusMessage } from "@/components/ui/status-message";

function SetDefaultButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? <Spinner /> : <Star aria-hidden="true" size={13} />}
            {pending ? "Saving..." : "Make default"}
        </Button>
    );
}

export function SetDefaultPathForm({ pathId }: { pathId: string }) {
    const [state, formAction] = useActionState(
        setDefaultDownloadPathAction,
        initialDefaultDownloadPathActionState,
    );

    return (
        <form action={formAction} className="flex flex-col items-end gap-1">
            <input type="hidden" name="pathId" value={pathId} />
            <SetDefaultButton />
            {state.status === "error" ? (
                <StatusMessage status={state.status} message={state.message} className="text-xs" />
            ) : null}
        </form>
    );
}
