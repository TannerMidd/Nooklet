"use client";

import { useActionState } from "react";

import { initialBootstrapActionState } from "@/app/(auth)/bootstrap/action-state";
import { AsyncButton } from "@/components/ui/async-button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

import {
  submitBootstrapAction,
} from "./actions";

type FieldProps = {
  label: string;
  name: "bootstrapToken" | "displayName" | "email" | "password" | "confirmPassword";
  type?: string;
  autoComplete?: string;
  error?: string;
};

function Field({ label, name, type = "text", autoComplete, error }: FieldProps) {
  const isPassword = name === "password" || name === "confirmPassword";
  return (
    <FormField
      label={label}
      required
      error={error}
      description={name === "password" ? "At least 12 characters with uppercase, lowercase, and a number." : undefined}
    >
      {(controlProps) => (
        <Input
          {...controlProps}
          name={name}
          type={type}
          autoComplete={autoComplete}
          minLength={isPassword ? 12 : undefined}
        />
      )}
    </FormField>
  );
}

export function BootstrapForm() {
  const [state, formAction] = useActionState(
    submitBootstrapAction,
    initialBootstrapActionState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="Setup token"
        name="bootstrapToken"
        type="password"
        autoComplete="off"
        error={state.fieldErrors?.bootstrapToken}
      />
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
        <p role="alert" className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3.5 py-2 text-sm text-foreground">
          {state.message}
        </p>
      ) : null}

      <AsyncButton type="submit" pendingLabel="Creating administrator…" className="mt-2 w-full">
        Create administrator
      </AsyncButton>
    </form>
  );
}
