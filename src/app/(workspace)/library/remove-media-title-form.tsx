"use client";

import { Trash2 } from "lucide-react";
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

function RemoveButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="danger" size="sm" disabled={pending} onClick={onClick}>
      <Trash2 aria-hidden="true" size={14} />
      {pending ? "Removing..." : "Remove"}
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
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  return (
    <>
      <form ref={formRef} action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="titleId" value={titleId} />
        <label className="flex min-h-11 items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            name="deleteFiles"
            checked={deleteFiles}
            onChange={(event) => setDeleteFiles(event.target.checked)}
            disabled={pending}
            className="h-4 w-4 accent-accent-wine"
          />
          Also delete files from disk
        </label>
        <RemoveButton pending={pending} onClick={() => setConfirmationOpen(true)} />
        {state.message ? (
          <InlineAlert
            variant={state.status === "error" ? "error" : state.status === "warning" ? "warning" : "success"}
            className="py-1.5 text-xs"
          >
            {state.message}
          </InlineAlert>
        ) : null}
      </form>

      <AlertDialog
        open={confirmationOpen}
        title={deleteFiles ? `Delete ${title}?` : `Remove ${title}?`}
        description={deleteFiles ? (
          <>
            Nooklet will remove this title and permanently delete its recorded media files from disk. <strong className="text-foreground">This cannot be undone.</strong> Active downloads or imports must finish first.
          </>
        ) : (
          <>Nooklet will remove this title from your library records. Files on disk will be kept, and active downloads or imports must finish first.</>
        )}
        confirmLabel={deleteFiles ? "Delete title and files" : "Remove from Nooklet"}
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
