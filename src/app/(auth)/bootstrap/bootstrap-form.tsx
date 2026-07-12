"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { initialBootstrapActionState } from "@/app/(auth)/bootstrap/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  submitBootstrapAction,
} from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="mt-2 w-full">
      {pending ? "Creating administrator..." : "Create administrator"}
    </Button>
  );
}

type FieldProps = {
  label: string;
  name: "displayName" | "email" | "password" | "confirmPassword";
  type?: string;
  autoComplete?: string;
  error?: string;
};

function Field({ label, name, type = "text", autoComplete, error }: FieldProps) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
      <Input name={name} type={type} autoComplete={autoComplete} aria-invalid={Boolean(error)} />
      {error ? <p className="text-sm text-accent-wine">{error}</p> : null}
    </label>
  );
}

export function BootstrapForm() {
  const [state, formAction] = useActionState(
    submitBootstrapAction,
    initialBootstrapActionState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Display name" name="displayName" autoComplete="name" error={state.fieldErrors?.displayName} />
      <Field label="Email" name="email" type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
      />
      <Field
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />

      {state.status === "error" && state.message ? (
        <p className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3.5 py-2 text-sm text-foreground">
          {state.message}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
