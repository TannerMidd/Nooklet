"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { removeMediaTitleAction } from "@/app/(workspace)/library/actions";
import { initialRemoveMediaTitleActionState } from "@/app/(workspace)/library/action-state";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";

type RemoveMediaTitleFormProps = {
    titleId: string;
    title: string;
};

function RemoveButton({
    pending,
    queued,
    onClick,
}: {
    pending: boolean;
    queued: boolean;
    onClick: () => void;
}) {
    return (
        <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={pending || queued}
            onClick={onClick}
        >
            <Trash2 aria-hidden="true" size={14} />
            {pending ? "Queueing..." : queued ? "Removal queued" : "Remove"}
        </Button>
    );
}

export function RemoveMediaTitleForm({ titleId, title }: RemoveMediaTitleFormProps) {
    const [state, formAction, pending] = useActionState(
        removeMediaTitleAction,
        initialRemoveMediaTitleActionState,
    );
    const formRef = useRef<HTMLFormElement | null>(null);
    const [deleteFiles, setDeleteFiles] = useState(false);
    const [retireActiveWork, setRetireActiveWork] = useState(false);
    const [confirmationOpen, setConfirmationOpen] = useState(false);
    const removalQueued = state.action === "queued_removal";

    return (
        <>
            <form ref={formRef} action={formAction} className="flex flex-col gap-2">
                <input type="hidden" name="titleId" value={titleId} />
                <label className="flex min-h-11 items-center gap-2 text-xs text-muted">
                    <input
                        type="checkbox"
                        name="deleteFiles"
                        checked={deleteFiles}
                        onChange={(event) => {
                            setDeleteFiles(event.target.checked);

                            if (event.target.checked) {
                                setRetireActiveWork(false);
                            }
                        }}
                        disabled={pending || removalQueued}
                        className="h-4 w-4 accent-accent-wine"
                    />
                    Also delete files from disk
                </label>
                <div
                    className={
                        state.action === "open_activity"
                            ? "rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3 py-2"
                            : undefined
                    }
                >
                    {state.action === "open_activity" ? (
                        <p className="mb-1 text-xs font-semibold text-foreground">
                            Safe removal can finish this automatically:
                        </p>
                    ) : null}
                    <label className="flex min-h-11 items-start gap-2 text-xs leading-5 text-muted">
                        <input
                            type="checkbox"
                            name="retireActiveWork"
                            checked={retireActiveWork}
                            onChange={(event) => setRetireActiveWork(event.target.checked)}
                            disabled={pending || removalQueued || deleteFiles}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-accent-wine"
                        />
                        Stop active season plans and downloads first, then remove this title.
                        Imported media files stay on disk.
                    </label>
                </div>
                <RemoveButton
                    pending={pending}
                    queued={removalQueued}
                    onClick={() => setConfirmationOpen(true)}
                />
                {state.message ? (
                    <InlineAlert
                        variant={
                            state.status === "error"
                                ? "error"
                                : state.status === "warning"
                                  ? "warning"
                                  : "success"
                        }
                        className="py-1.5 text-xs"
                    >
                        {state.message}
                        {state.action === "open_activity" ? (
                            <>
                                {" "}
                                <Link
                                    href="/in-progress"
                                    className="font-semibold text-accent underline underline-offset-2"
                                >
                                    Open Activity
                                </Link>
                            </>
                        ) : null}
                        {state.action === "queued_removal" ? (
                            <>
                                {" "}
                                <Link
                                    href="/health"
                                    className="font-semibold text-accent underline underline-offset-2"
                                >
                                    View background job
                                </Link>
                            </>
                        ) : null}
                    </InlineAlert>
                ) : null}
            </form>

            <AlertDialog
                open={confirmationOpen}
                title={deleteFiles ? `Delete ${title}?` : `Remove ${title}?`}
                description={
                    deleteFiles ? (
                        <>
                            Nooklet will remove this title and permanently delete its recorded media
                            files from disk.{" "}
                            <strong className="text-foreground">This cannot be undone.</strong>{" "}
                            Active season recovery, downloads, or imports must be stopped first.
                        </>
                    ) : retireActiveWork ? (
                        <>
                            Nooklet will persist this request, stop active season recovery and
                            downloader jobs, verify their cleanup, and then remove the title from
                            the library. Imported media and other library files will stay on disk.
                            Incomplete downloader files owned by the cancelled work may be removed.
                        </>
                    ) : (
                        <>
                            Nooklet will remove this title from your library records. Files on disk
                            will be kept, and active season recovery, downloads, or imports must be
                            stopped first.
                        </>
                    )
                }
                confirmLabel={
                    deleteFiles
                        ? "Delete title and files"
                        : retireActiveWork
                          ? "Stop activity and remove"
                          : "Remove from Nooklet"
                }
                pending={pending}
                tone="danger"
                onClose={() => setConfirmationOpen(false)}
                onConfirm={() => {
                    formRef.current?.requestSubmit();
                    setConfirmationOpen(false);
                }}
            />
        </>
    );
}
