"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  initialCreateManagedUserActionState,
} from "@/app/(workspace)/admin/action-state";
import { submitCreateManagedUserAction } from "@/app/(workspace)/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto">
      {pending ? "Creating user..." : "Create user"}
    </Button>
  );
}

export function CreateUserForm() {
  const [state, formAction] = useActionState(
    submitCreateManagedUserAction,
    initialCreateManagedUserActionState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Display name</span>
          <Input
            name="displayName"
            placeholder="Taylor Example"
            aria-invalid={Boolean(state.fieldErrors?.displayName)}
          />
          {state.fieldErrors?.displayName ? (
            <p className="text-sm text-highlight">{state.fieldErrors.displayName}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Email</span>
          <Input
            name="email"
            type="email"
            placeholder="taylor@example.com"
            aria-invalid={Boolean(state.fieldErrors?.email)}
          />
          {state.fieldErrors?.email ? (
            <p className="text-sm text-highlight">{state.fieldErrors.email}</p>
          ) : null}
        </label>
      </div>

      <div className="grid gap-5 md:grid-cols-[0.7fr,1fr,1fr]">
        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Role</span>
          <select
            name="role"
            defaultValue="user"
            className="min-h-11 w-full rounded-lg border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
            aria-invalid={Boolean(state.fieldErrors?.role)}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          {state.fieldErrors?.role ? (
            <p className="text-sm text-highlight">{state.fieldErrors.role}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Temporary password</span>
          <Input
            name="password"
            type="password"
            aria-invalid={Boolean(state.fieldErrors?.password)}
          />
          {state.fieldErrors?.password ? (
            <p className="text-sm text-highlight">{state.fieldErrors.password}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Confirm password</span>
          <Input
            name="confirmPassword"
            type="password"
            aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          />
          {state.fieldErrors?.confirmPassword ? (
            <p className="text-sm text-highlight">{state.fieldErrors.confirmPassword}</p>
          ) : null}
        </label>
      </div>

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
          New accounts are created in the normalized users table and immediately inherit the local login flow.
        </p>
      </div>
    </form>
  );
}
