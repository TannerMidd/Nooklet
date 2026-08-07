"use client";

import { useActionState } from "react";

import { initialLoginActionState } from "@/app/(auth)/login/action-state";
import { AsyncButton } from "@/components/ui/async-button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

import { submitLoginAction } from "./actions";

type LoginFormProps = {
  callbackUrl: string;
  showBootstrapSuccess: boolean;
  showPasswordChangedSuccess: boolean;
};

export function LoginForm({
  callbackUrl,
  showBootstrapSuccess,
  showPasswordChangedSuccess,
}: LoginFormProps) {
  const [state, formAction] = useActionState(submitLoginAction, initialLoginActionState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {showBootstrapSuccess ? (
        <p role="status" className="rounded-lg border border-accent-cool/30 bg-accent-cool/10 px-3.5 py-2 text-sm text-foreground">
          First-admin bootstrap is complete. Sign in with the account you just created.
        </p>
      ) : null}
      {showPasswordChangedSuccess ? (
        <p role="status" className="rounded-lg border border-accent-cool/30 bg-accent-cool/10 px-3.5 py-2 text-sm text-foreground">
          Password updated. Sign in with your new password to continue.
        </p>
      ) : null}

      <FormField label="Email" required error={state.fieldErrors?.email}>
        {(controlProps) => (
          <Input {...controlProps} name="email" type="email" autoComplete="email" />
        )}
      </FormField>

      <FormField label="Password" required error={state.fieldErrors?.password}>
        {(controlProps) => (
          <Input {...controlProps} name="password" type="password" autoComplete="current-password" />
        )}
      </FormField>

      {state.status === "error" && state.message ? (
        <p role="alert" className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3.5 py-2 text-sm text-foreground">
          {state.message}
        </p>
      ) : null}

      <AsyncButton type="submit" pendingLabel="Signing in…" className="mt-2 w-full">
        Sign in
      </AsyncButton>

    </form>
  );
}
