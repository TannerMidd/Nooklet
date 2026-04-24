"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { initialLoginActionState } from "@/app/(auth)/login/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { submitLoginAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full">
      {pending ? "Signing in..." : "Sign in"}
    </Button>
  );
}

type LoginFormProps = {
  showBootstrapSuccess: boolean;
};

export function LoginForm({ showBootstrapSuccess }: LoginFormProps) {
  const [state, formAction] = useActionState(submitLoginAction, initialLoginActionState);

  return (
    <form action={formAction} className="space-y-5">
      {showBootstrapSuccess ? (
        <p className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-foreground">
          First-admin bootstrap is complete. Sign in with the account you just created.
        </p>
      ) : null}

      <label className="space-y-2">
        <span className="text-sm font-medium text-foreground">Email</span>
        <Input name="email" type="email" autoComplete="email" aria-invalid={Boolean(state.fieldErrors?.email)} />
        {state.fieldErrors?.email ? <p className="text-sm text-highlight">{state.fieldErrors.email}</p> : null}
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium text-foreground">Password</span>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
        {state.fieldErrors?.password ? (
          <p className="text-sm text-highlight">{state.fieldErrors.password}</p>
        ) : null}
      </label>

      {state.status === "error" && state.message ? (
        <p className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight">
          {state.message}
        </p>
      ) : null}

      <SubmitButton />

      <p className="text-sm leading-6 text-muted">
        Need the initial account instead? <Link href="/bootstrap" className="text-foreground underline underline-offset-4">Open bootstrap</Link> while the instance is still fresh.
      </p>
    </form>
  );
}
