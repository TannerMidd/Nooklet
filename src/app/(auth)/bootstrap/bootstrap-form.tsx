"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  initialBootstrapActionState,
  submitBootstrapAction,
} from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full">
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
    <label className="space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <Input name={name} type={type} autoComplete={autoComplete} aria-invalid={Boolean(error)} />
      {error ? <p className="text-sm text-highlight">{error}</p> : null}
    </label>
  );
}

export function BootstrapForm() {
  const [state, formAction] = useActionState(
    submitBootstrapAction,
    initialBootstrapActionState,
  );

  return (
    <form action={formAction} className="space-y-5">
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
        <p className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight">
          {state.message}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
