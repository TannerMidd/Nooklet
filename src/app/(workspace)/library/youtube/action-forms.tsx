"use client";

import { Pause, Play, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import {
    cancelYouTubeDownloadAction,
    configureYouTubeRequestAction,
    removeYouTubeSourceAction,
    retryAllYouTubeDownloadsAction,
    retryYouTubeDownloadAction,
    retryYouTubeSourceInitializationAction,
    runYouTubeSourceSyncAction,
    setYouTubeSourcePausedAction,
    updateYouTubeSourceAction,
} from "@/app/(workspace)/library/youtube/actions";
import {
    initialYouTubeActionState,
    type YouTubeActionState,
} from "@/app/(workspace)/library/youtube/action-state";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { AsyncButton } from "@/components/ui/async-button";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";
import { ToggleField } from "@/components/ui/toggle-switch";

export type YouTubeDestinationOption = {
    id: string;
    label: string;
    isDefault: boolean;
};

export type YouTubeQualityOption = {
    value: "mp4-720p" | "mp4-1080p" | "mp4-2160p" | "best";
    label: string;
};

export type YouTubeSelectableVideo = {
    youtubeVideoId: string;
    title: string;
    channelTitle: string | null;
    publishedAt: Date | null;
    eligible: boolean;
};

type YouTubeRequestOptions = {
    destinations: YouTubeDestinationOption[];
    qualityProfiles: YouTubeQualityOption[];
};

function defaultDestination(options: YouTubeRequestOptions) {
    return (
        options.destinations.find((destination) => destination.isDefault)?.id ??
        options.destinations[0]?.id
    );
}

function ActionResult({ state }: { state: YouTubeActionState }) {
    return <StatusMessage status={state.status} message={state.message} />;
}

function ExistingVideoSelection({ videos }: { videos: YouTubeSelectableVideo[] }) {
    const [selectedVideoIds, setSelectedVideoIds] = useState(
        () => new Set(videos.map((video) => video.youtubeVideoId)),
    );

    const setVideoSelected = (videoId: string, selected: boolean) => {
        setSelectedVideoIds((current) => {
            const next = new Set(current);

            if (selected) {
                next.add(videoId);
            } else {
                next.delete(videoId);
            }

            return next;
        });
    };

    return (
        <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground">
                Existing videos to download
            </legend>
            <p className="text-[13px] leading-5 text-muted">
                All eligible videos are selected by default. Clear the selection to establish the
                monitor without downloading its existing backlog.
            </p>
            {videos.length > 0 ? (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted" aria-live="polite">
                            {selectedVideoIds.size} of {videos.length} selected
                        </span>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                    setSelectedVideoIds(
                                        new Set(videos.map((video) => video.youtubeVideoId)),
                                    )
                                }
                            >
                                Select all
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => setSelectedVideoIds(new Set())}
                            >
                                Clear selection
                            </Button>
                        </div>
                    </div>
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-cream/[0.08] p-2">
                        {videos.map((video) => (
                            <label
                                key={video.youtubeVideoId}
                                className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-cream/[0.04]"
                            >
                                <input
                                    type="checkbox"
                                    name="videoIds"
                                    value={video.youtubeVideoId}
                                    checked={selectedVideoIds.has(video.youtubeVideoId)}
                                    onChange={(event) =>
                                        setVideoSelected(video.youtubeVideoId, event.target.checked)
                                    }
                                    className="mt-1 h-4 w-4 rounded border-cream/[0.14] bg-panel text-accent"
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-foreground">
                                        {video.title}
                                    </span>
                                    <span className="block text-xs text-muted">
                                        {video.channelTitle ?? "YouTube"}
                                        {video.publishedAt
                                            ? ` · ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(video.publishedAt)}`
                                            : ""}
                                    </span>
                                </span>
                            </label>
                        ))}
                    </div>
                </>
            ) : (
                <p className="rounded-lg border border-cream/[0.08] px-3 py-2 text-sm text-muted">
                    No downloadable regular videos were found in this source. You can still monitor
                    it for future additions.
                </p>
            )}
        </fieldset>
    );
}

export function YouTubeDownloadConfigurationForm({
    targetKind,
    targetUrl,
    videos,
    options,
}: {
    targetKind: "video" | "source";
    targetUrl: string;
    videos: YouTubeSelectableVideo[];
    options: YouTubeRequestOptions;
}) {
    const [state, formAction] = useActionState(
        configureYouTubeRequestAction,
        initialYouTubeActionState,
    );
    const eligibleVideos = videos.filter((video) => video.eligible);

    return (
        <form action={formAction} className="space-y-4">
            <input type="hidden" name="targetKind" value={targetKind} />
            <input type="hidden" name="targetUrl" value={targetUrl} />

            {targetKind === "source" ? (
                <div className="space-y-4">
                    <ExistingVideoSelection
                        key={eligibleVideos.map((video) => video.youtubeVideoId).join(":")}
                        videos={eligibleVideos}
                    />
                    <ToggleField
                        name="monitorFuture"
                        label="Monitor future additions"
                        description="After the baseline completes, automatically queue newly added regular videos."
                        defaultChecked
                        divided={false}
                    />
                </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                    label="Destination"
                    required
                    error={state.fieldErrors?.libraryPathId}
                    description="Files are organized by channel and publish date under this root."
                >
                    {(controlProps) => (
                        <Select
                            {...controlProps}
                            name="libraryPathId"
                            defaultValue={defaultDestination(options)}
                        >
                            {options.destinations.map((destination) => (
                                <option key={destination.id} value={destination.id}>
                                    {destination.label}
                                    {destination.isDefault ? " (default)" : ""}
                                </option>
                            ))}
                        </Select>
                    )}
                </FormField>
                <FormField
                    label="Quality"
                    required
                    error={state.fieldErrors?.qualityProfile}
                    description="MP4 profiles cap resolution without CPU-heavy transcoding."
                >
                    {(controlProps) => (
                        <Select {...controlProps} name="qualityProfile" defaultValue="mp4-1080p">
                            {options.qualityProfiles.map((profile) => (
                                <option key={profile.value} value={profile.value}>
                                    {profile.label}
                                </option>
                            ))}
                        </Select>
                    )}
                </FormField>
            </div>

            <ActionResult state={state} />
            <AsyncButton type="submit" pendingLabel="Saving YouTube request…">
                {targetKind === "source" ? "Save selection" : "Download video"}
            </AsyncButton>
        </form>
    );
}

function CompactActionForm({
    action,
    hidden,
    label,
    pendingLabel,
    icon,
    variant = "secondary",
}: {
    action: typeof runYouTubeSourceSyncAction;
    hidden: Record<string, string>;
    label: string;
    pendingLabel: string;
    icon?: React.ReactNode;
    variant?: "secondary" | "danger";
}) {
    const [state, formAction] = useActionState(action, initialYouTubeActionState);

    return (
        <form action={formAction} className="space-y-1.5">
            {Object.entries(hidden).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
            ))}
            <AsyncButton type="submit" size="sm" variant={variant} pendingLabel={pendingLabel}>
                {icon}
                {label}
            </AsyncButton>
            <ActionResult state={state} />
        </form>
    );
}

export function YouTubeSourceControls({
    source,
    options,
}: {
    source: {
        id: string;
        status: "initializing" | "active" | "paused" | "error";
        libraryPathId: string;
        qualityProfile: YouTubeQualityOption["value"];
        title: string;
        baselineCompleted: boolean;
    };
    options: YouTubeRequestOptions;
}) {
    const [editState, editAction] = useActionState(
        updateYouTubeSourceAction,
        initialYouTubeActionState,
    );
    const [removeState, removeAction] = useActionState(
        removeYouTubeSourceAction,
        initialYouTubeActionState,
    );
    const removeFormRef = useRef<HTMLFormElement>(null);
    const [confirmingRemove, setConfirmingRemove] = useState(false);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                <CompactActionForm
                    action={setYouTubeSourcePausedAction}
                    hidden={{
                        sourceId: source.id,
                        paused: source.status === "paused" ? "false" : "true",
                    }}
                    label={source.status === "paused" ? "Resume" : "Pause"}
                    pendingLabel={source.status === "paused" ? "Resuming…" : "Pausing…"}
                    icon={
                        source.status === "paused" ? (
                            <Play aria-hidden="true" className="h-4 w-4" />
                        ) : (
                            <Pause aria-hidden="true" className="h-4 w-4" />
                        )
                    }
                />
                <CompactActionForm
                    action={
                        !source.baselineCompleted
                            ? retryYouTubeSourceInitializationAction
                            : runYouTubeSourceSyncAction
                    }
                    hidden={{ sourceId: source.id }}
                    label={!source.baselineCompleted ? "Retry initialization" : "Sync now"}
                    pendingLabel="Starting sync…"
                    icon={<RefreshCw aria-hidden="true" className="h-4 w-4" />}
                />
            </div>

            <details className="rounded-xl border border-cream/[0.08] bg-cream/[0.02] p-3">
                <summary className="cursor-pointer text-sm font-semibold text-foreground">
                    Edit future downloads
                </summary>
                <form action={editAction} className="mt-4 space-y-4">
                    <input type="hidden" name="sourceId" value={source.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5 text-sm font-medium text-foreground">
                            Destination
                            <Select name="libraryPathId" defaultValue={source.libraryPathId}>
                                {options.destinations.map((destination) => (
                                    <option key={destination.id} value={destination.id}>
                                        {destination.label}
                                    </option>
                                ))}
                            </Select>
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-foreground">
                            Quality
                            <Select name="qualityProfile" defaultValue={source.qualityProfile}>
                                {options.qualityProfiles.map((profile) => (
                                    <option key={profile.value} value={profile.value}>
                                        {profile.label}
                                    </option>
                                ))}
                            </Select>
                        </label>
                    </div>
                    <ActionResult state={editState} />
                    <AsyncButton type="submit" size="sm" variant="secondary" pendingLabel="Saving…">
                        <Save aria-hidden="true" className="h-4 w-4" /> Save future settings
                    </AsyncButton>
                </form>
            </details>

            <form ref={removeFormRef} action={removeAction} className="space-y-2">
                <input type="hidden" name="sourceId" value={source.id} />
                <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => setConfirmingRemove(true)}
                >
                    <Trash2 aria-hidden="true" className="h-4 w-4" /> Remove monitor
                </Button>
                <ActionResult state={removeState} />
            </form>
            <AlertDialog
                open={confirmingRemove}
                title={`Remove ${source.title}?`}
                description="Monitoring will stop and its membership history will be removed. Videos already downloaded to your library will remain on disk."
                confirmLabel="Remove monitor"
                onClose={() => setConfirmingRemove(false)}
                onConfirm={() => {
                    setConfirmingRemove(false);
                    removeFormRef.current?.requestSubmit();
                }}
            />
        </div>
    );
}

export function YouTubeDownloadActionForm({
    downloadId,
    action,
}: {
    downloadId: string;
    action: "cancel" | "retry";
}) {
    return (
        <CompactActionForm
            action={action === "cancel" ? cancelYouTubeDownloadAction : retryYouTubeDownloadAction}
            hidden={{ downloadId }}
            label={action === "cancel" ? "Cancel" : "Retry"}
            pendingLabel={action === "cancel" ? "Cancelling…" : "Retrying…"}
            variant={action === "cancel" ? "danger" : "secondary"}
        />
    );
}

export function YouTubeBulkRetryForm() {
    return (
        <CompactActionForm
            action={retryAllYouTubeDownloadsAction}
            hidden={{}}
            label="Run all now"
            pendingLabel="Queueing all…"
            icon={<RotateCcw aria-hidden="true" className="h-4 w-4" />}
        />
    );
}
