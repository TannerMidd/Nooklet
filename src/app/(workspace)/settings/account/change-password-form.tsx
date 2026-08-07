"use client";

import Link from "next/link";
import { useActionState } from "react";

import { initialChangePasswordActionState } from "@/app/(workspace)/settings/account/action-state";
import { AsyncButton } from "@/components/ui/async-button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

import { submitChangePasswordAction } from "./actions";

type PasswordFieldProps = {
    label: string;
    name: "currentPassword" | "newPassword" | "confirmPassword";
    autoComplete: string;
    error?: string;
};

function PasswordField({ label, name, autoComplete, error }: PasswordFieldProps) {
    const isNewPassword = name !== "currentPassword";

    return (
        <FormField
            label={label}
            required
            error={error}
            description={
                name === "newPassword"
                    ? "At least 12 characters with uppercase, lowercase, and a number."
                    : undefined
            }
        >
            {(controlProps) => (
                <Input
                    {...controlProps}
                    name={name}
                    type="password"
                    autoComplete={autoComplete}
                    minLength={isNewPassword ? 12 : undefined}
                />
            )}
        </FormField>
    );
}

export function ChangePasswordForm() {
    const [state, formAction] = useActionState(
        submitChangePasswordAction,
        initialChangePasswordActionState,
    );

    return (
        <form action={formAction} className="max-w-md space-y-5">
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

            {state.status === "success" ? (
                <Link
                    href="/login?passwordChanged=1&callbackUrl=%2Fhome"
                    className="inline-flex min-h-11 items-center rounded-lg border border-cream/[0.14] px-4 text-sm font-semibold text-foreground hover:bg-cream/[0.06]"
                >
                    Sign in again
                </Link>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <AsyncButton
                    type="submit"
                    pendingLabel="Updating password…"
                    className="w-full sm:w-auto"
                >
                    Update password
                </AsyncButton>
                <p className="text-sm leading-6 text-muted">
                    Password rules match bootstrap: at least 12 characters with uppercase,
                    lowercase, and a number.
                </p>
            </div>
        </form>
    );
}
