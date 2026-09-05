"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateMediaTitlePreferencesAction } from "@/app/(workspace)/library/actions";
import { initialMediaTitlePreferenceActionState } from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InlineAlert } from "@/components/ui/inline-alert";
import { type MediaQualityProfileOption } from "@/modules/media-library/queries/list-media-quality-profiles";

type MediaTitlePreferencesFormProps = {
    titleId: string;
    monitored: boolean;
    qualityProfile: MediaQualityProfileOption["value"];
    qualityProfiles: readonly MediaQualityProfileOption[];
    className?: string;
};

function SaveButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" variant="secondary" disabled={pending}>
            <Save aria-hidden="true" size={16} />
            {pending ? "Saving..." : "Save"}
        </Button>
    );
}

export function MediaTitlePreferencesForm({
    titleId,
    monitored,
    qualityProfile,
    qualityProfiles,
    className,
}: MediaTitlePreferencesFormProps) {
    const [state, formAction] = useActionState(
        updateMediaTitlePreferencesAction,
        initialMediaTitlePreferenceActionState,
    );

    return (
        <form
            action={formAction}
            className={cn(
                "grid gap-3 rounded-[13px] border border-cream/[0.08] bg-cream/[0.03] p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end",
                className,
            )}
        >
            <input type="hidden" name="titleId" value={titleId} />
            <label className="inline-flex min-h-11 items-center gap-2 rounded-md border border-cream/[0.08] bg-cream/[0.03] px-2.5 py-1.5 text-sm text-muted">
                <input
                    type="checkbox"
                    name="monitored"
                    defaultChecked={monitored}
                    className="h-4 w-4 accent-accent"
                />
                Monitor
            </label>
            <label className="space-y-1 text-sm">
                <span className="font-medium text-foreground">Quality profile</span>
                <select
                    name="qualityProfile"
                    defaultValue={qualityProfile}
                    className="min-h-11 w-full rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-3 py-1.5 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-cream/[0.04] focus:ring-1 focus:ring-accent/25"
                >
                    {qualityProfiles.map((profile) => (
                        <option key={profile.value} value={profile.value}>
                            {profile.label}
                        </option>
                    ))}
                </select>
            </label>
            <SaveButton />
            {state.message ? (
                <InlineAlert
                    variant={state.status === "success" ? "success" : "error"}
                    className="md:col-span-3"
                >
                    {state.message}
                </InlineAlert>
            ) : null}
        </form>
    );
}
