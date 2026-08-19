"use client";

import { Clock, Play, Save } from "lucide-react";
import { useActionState } from "react";

import {
    initialYouTubeActionState,
    type YouTubeActionState,
} from "@/app/(workspace)/library/youtube/action-state";
import { AsyncButton } from "@/components/ui/async-button";
import { Panel } from "@/components/ui/panel";
import { ScheduleIntervalSelect } from "@/components/ui/schedule-interval-select";
import { StatusMessage } from "@/components/ui/status-message";
import { ToggleField } from "@/components/ui/toggle-switch";

export type YouTubeAutomationSettings = {
    enabled: boolean;
    intervalMinutes: number;
    lastCompletedAt: Date | null;
    nextRunAt: Date | null;
    lastStatus: string | null;
    lastError: string | null;
};

export type YouTubeAutomationAction = (
    previousState: YouTubeActionState,
    formData: FormData,
) => Promise<YouTubeActionState>;

function formatDate(value: Date | null) {
    return value
        ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value)
        : "Not scheduled";
}

export function YouTubeAutomationPanel({
    settings,
    saveAction,
    runNowAction,
}: {
    settings: YouTubeAutomationSettings;
    saveAction: YouTubeAutomationAction;
    runNowAction: YouTubeAutomationAction;
}) {
    const [saveState, saveFormAction] = useActionState(saveAction, initialYouTubeActionState);
    const [runState, runFormAction] = useActionState(runNowAction, initialYouTubeActionState);

    return (
        <Panel
            eyebrow="YouTube"
            title="Source monitoring"
            description="Check every user’s active channel and playlist monitors for new public regular videos. The schedule is shared across this Nooklet instance."
        >
            <form action={saveFormAction} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,0.5fr)_minmax(180px,0.25fr)_minmax(220px,0.35fr)] md:items-end">
                    <ToggleField
                        name="enabled"
                        label="Automatic YouTube sync"
                        description="Queue newly discovered eligible videos after each source baseline."
                        defaultChecked={settings.enabled}
                        divided={false}
                        className="rounded-lg border border-cream/[0.08] bg-cream/[0.03] px-3"
                    />
                    <label className="space-y-1.5 text-sm">
                        <span className="font-medium text-foreground">Run</span>
                        <ScheduleIntervalSelect
                            name="intervalMinutes"
                            unit="minutes"
                            defaultValue={settings.intervalMinutes}
                            invalid={Boolean(saveState.fieldErrors?.intervalMinutes)}
                        />
                        {saveState.fieldErrors?.intervalMinutes ? (
                            <span role="alert" className="block text-sm text-accent-wine">
                                {saveState.fieldErrors.intervalMinutes}
                            </span>
                        ) : null}
                    </label>
                    <div className="rounded-lg border border-cream/[0.08] bg-cream/[0.03] px-3 py-2 text-sm leading-6 text-muted">
                        <p className="flex items-center gap-2 text-foreground">
                            <Clock aria-hidden="true" className="h-4 w-4" />
                            {settings.lastStatus ?? "Idle"}
                        </p>
                        <p>Last run: {formatDate(settings.lastCompletedAt)}</p>
                        <p>Next run: {formatDate(settings.nextRunAt)}</p>
                    </div>
                </div>
                {settings.lastError ? (
                    <p
                        role="alert"
                        className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3 py-2 text-sm text-foreground"
                    >
                        The last YouTube source sync did not complete. Open the YouTube library to
                        retry individual sources.
                    </p>
                ) : null}
                <StatusMessage status={saveState.status} message={saveState.message} />
                <AsyncButton type="submit" variant="secondary" pendingLabel="Saving schedule…">
                    <Save aria-hidden="true" className="h-4 w-4" /> Save schedule
                </AsyncButton>
            </form>

            <form
                action={runFormAction}
                className="mt-4 space-y-2 border-t border-cream/[0.07] pt-4"
            >
                <AsyncButton
                    type="submit"
                    variant="secondary"
                    size="sm"
                    pendingLabel="Starting sync…"
                >
                    <Play aria-hidden="true" className="h-4 w-4" /> Run now
                </AsyncButton>
                <StatusMessage status={runState.status} message={runState.message} />
            </form>
        </Panel>
    );
}
