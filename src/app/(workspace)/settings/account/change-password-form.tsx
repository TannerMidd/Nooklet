"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { initialChangePasswordActionState } from "@/app/(workspace)/settings/account/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  submitChangePasswordAction,
} from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto">
      {pending ? "Updating password..." : "Update password"}
    </Button>
  );
}

type PasswordFieldProps = {
  label: string;
  name: "currentPassword" | "newPassword" | "confirmPassword";
  autoComplete: string;
  error?: string;
};

function PasswordField({ label, name, autoComplete, error }: PasswordFieldProps) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <Input
        name={name}
        type="password"
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
      />
      {error ? <p className="text-sm text-highlight">{error}</p> : null}
    </label>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(
    submitChangePasswordAction,
    initialChangePasswordActionState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <PasswordField
        label="Current password"
        name="currentPassword"
        autoComplete="current-password"
        error={state.fieldErrors?.currentPassword}
      />
      <PasswordField
        label="New password"
        name="newPassword"
        autoComplete="new-password"
        error={state.fieldErrors?.newPassword}
      />
      <PasswordField
        label="Confirm new password"
        name="confirmPassword"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />

      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-foreground"
              : "rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton />
        <p className="text-sm leading-6 text-muted">
          Password rules match bootstrap: at least 12 characters with uppercase,
          lowercase, and a number.
        </p>
      </div>
    </form>
  );
}
