"use client";

import { useActionState } from "react";

import {
  initialCreateManagedUserActionState,
} from "@/app/(workspace)/admin/action-state";
import { submitCreateManagedUserAction } from "@/app/(workspace)/admin/actions";
import { AsyncButton } from "@/components/ui/async-button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export function CreateUserForm() {
  const [state, formAction] = useActionState(
    submitCreateManagedUserAction,
    initialCreateManagedUserActionState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-3.5 md:grid-cols-2">
        <FormField label="Display name" required error={state.fieldErrors?.displayName}>
          {(controlProps) => <Input {...controlProps} name="displayName" autoComplete="name" placeholder="Taylor Example" />}
        </FormField>

        <FormField label="Email" required error={state.fieldErrors?.email}>
          {(controlProps) => <Input {...controlProps} name="email" type="email" autoComplete="email" placeholder="taylor@example.com" />}
        </FormField>
      </div>

      <div className="grid gap-3.5 md:grid-cols-[0.7fr,1fr,1fr]">
        <FormField label="Role" required error={state.fieldErrors?.role} description="Users can request media; admins can change instance configuration.">
          {(controlProps) => (
            <select
              {...controlProps}
              name="role"
              defaultValue="user"
              className="min-h-11 w-full rounded-lg border border-control bg-panel px-3 py-2 text-sm text-foreground outline-none transition focus:border-focus focus:ring-2 focus:ring-focus/25"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          )}
        </FormField>

        <FormField label="Temporary password" required error={state.fieldErrors?.password} description="At least 12 characters with uppercase, lowercase, and a number.">
          {(controlProps) => <Input {...controlProps} name="password" type="password" autoComplete="new-password" minLength={12} />}
        </FormField>

        <FormField label="Confirm password" required error={state.fieldErrors?.confirmPassword}>
          {(controlProps) => <Input {...controlProps} name="confirmPassword" type="password" autoComplete="new-password" minLength={12} />}
        </FormField>
      </div>

      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "success"
              ? "rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-foreground"
              : "rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3 py-2 text-sm text-accent-wine"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <AsyncButton type="submit" pendingLabel="Creating user…" className="w-full sm:w-auto">
          Create user
        </AsyncButton>
        <p className="text-sm leading-6 text-muted">
          New accounts can use shared services and storage immediately. History and notifications remain personal.
        </p>
      </div>
    </form>
  );
}
