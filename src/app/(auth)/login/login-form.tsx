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
    <Button type="submit" className="mt-2 w-full">
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
    <form action={formAction} className="space-y-4">
      {showBootstrapSuccess ? (
        <p className="rounded-lg border border-accent-cool/30 bg-accent-cool/10 px-3.5 py-2 text-sm text-foreground">
          First-admin bootstrap is complete. Sign in with the account you just created.
        </p>
      ) : null}

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Email</span>
        <Input name="email" type="email" autoComplete="email" aria-invalid={Boolean(state.fieldErrors?.email)} />
        {state.fieldErrors?.email ? <p className="text-sm text-accent-wine">{state.fieldErrors.email}</p> : null}
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Password</span>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
        {state.fieldErrors?.password ? (
          <p className="text-sm text-accent-wine">{state.fieldErrors.password}</p>
        ) : null}
      </label>

      {state.status === "error" && state.message ? (
        <p className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3.5 py-2 text-sm text-foreground">
          {state.message}
        </p>
      ) : null}

      <SubmitButton />

      <p className="pt-2 text-center text-[13px] leading-5 text-muted">
        Fresh install?{" "}
        <Link href="/bootstrap" className="text-accent hover:brightness-110">
          Set up the first admin
        </Link>
      </p>
    </form>
  );
}
