"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { removeMediaTitleAction } from "@/app/(workspace)/library/actions";
import { initialRemoveMediaTitleActionState } from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";

type RemoveMediaTitleFormProps = {
  titleId: string;
};

function RemoveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      <Trash2 aria-hidden="true" size={14} />
      {pending ? "Removing..." : "Remove"}
    </Button>
  );
}

export function RemoveMediaTitleForm({ titleId }: RemoveMediaTitleFormProps) {
  const [state, formAction] = useActionState(
    removeMediaTitleAction,
    initialRemoveMediaTitleActionState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="titleId" value={titleId} />
      <RemoveButton />
      {state.message ? (
        <span className={state.status === "error" ? "text-xs text-red-200" : "text-xs text-muted"}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
