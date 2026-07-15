"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import {
  initialManagedUserMutationActionState,
  initialResetManagedUserPasswordActionState,
} from "@/app/(workspace)/admin/action-state";
import {
  submitResetManagedUserPasswordAction,
  submitUpdateManagedUserRoleAction,
  submitUpdateManagedUserStatusAction,
} from "@/app/(workspace)/admin/actions";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { type UserRole } from "@/lib/database/schema";

import {
  passwordResetConfirmation,
  roleChangeConfirmation,
  statusChangeConfirmation,
} from "./user-management-copy";

type UserManagementRowProps = {
  currentAdminUserId: string;
  user: {
    id: string;
    displayName: string;
    role: UserRole;
    isDisabled: boolean;
  };
};

type ConfirmationKind = "role" | "status" | "password" | null;

function ActionMessage({ state }: { state: { status: "idle" | "error" | "success"; message?: string } }) {
  if (!state.message) return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error"
        ? "rounded-lg border border-accent-wine/25 bg-accent-wine/10 px-3 py-2 text-sm text-accent-wine"
        : "rounded-lg border border-accent-cool/20 bg-accent-cool/10 px-3 py-2 text-sm text-foreground"}
    >
      {state.message}
    </p>
  );
}

export function UserManagementRow({ currentAdminUserId, user }: UserManagementRowProps) {
  const isCurrentAdmin = currentAdminUserId === user.id;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmationKind, setConfirmationKind] = useState<ConfirmationKind>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>(user.role);
  const roleFormRef = useRef<HTMLFormElement | null>(null);
  const statusFormRef = useRef<HTMLFormElement | null>(null);
  const passwordFormRef = useRef<HTMLFormElement | null>(null);
  const [roleState, roleAction, rolePending] = useActionState(
    submitUpdateManagedUserRoleAction,
    initialManagedUserMutationActionState,
  );
  const [statusState, statusAction, statusPending] = useActionState(
    submitUpdateManagedUserStatusAction,
    initialManagedUserMutationActionState,
  );
  const [passwordState, passwordAction, passwordPending] = useActionState(
    submitResetManagedUserPasswordAction,
    initialResetManagedUserPasswordActionState,
  );
  const pending = rolePending || statusPending || passwordPending;

  if (isCurrentAdmin) {
    return (
      <Link
        href="/settings/account"
        className="inline-flex min-h-11 items-center rounded-lg border border-cream/10 bg-cream/[0.04] px-4 py-2 text-sm font-semibold text-foreground hover:border-accent/35 hover:bg-cream/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Manage my account
      </Link>
    );
  }

  const roleConfirmation = roleChangeConfirmation(user.displayName, user.role, selectedRole);
  const confirmation = confirmationKind === "role"
    ? roleConfirmation
    : confirmationKind === "status"
      ? statusChangeConfirmation(user.displayName, !user.isDisabled)
      : confirmationKind === "password"
        ? passwordResetConfirmation(user.displayName)
        : null;

  function confirmAction() {
    if (confirmationKind === "role") roleFormRef.current?.requestSubmit();
    if (confirmationKind === "status") statusFormRef.current?.requestSubmit();
    if (confirmationKind === "password") passwordFormRef.current?.requestSubmit();
    setConfirmationKind(null);
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setDrawerOpen(true)} aria-haspopup="dialog">
        Manage user
      </Button>

      <Drawer
        open={drawerOpen}
        onClose={() => { if (!pending) setDrawerOpen(false); }}
        title={`Manage ${user.displayName}`}
        className="w-[min(94vw,32rem)]"
      >
        <div className="space-y-6 p-5">
          <div className="rounded-xl border border-cream/10 bg-cream/[0.03] p-4 text-sm leading-6">
            <p className="font-semibold text-foreground">Current access</p>
            <p className="mt-1 text-muted">
              {user.role === "admin"
                ? "Administrator · can manage shared instance configuration and users."
                : "User · can browse, request, and manage personal preferences."}
            </p>
            <p className="mt-1 text-muted">Account is {user.isDisabled ? "disabled" : "active"}.</p>
          </div>

          <form ref={roleFormRef} action={roleAction} className="space-y-3 rounded-xl border border-cream/10 p-4">
            <input type="hidden" name="userId" value={user.id} />
            <FormField label="Role" description="Administrators can change all shared server configuration.">
              {(controlProps) => (
                <select
                  {...controlProps}
                  name="role"
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value as UserRole)}
                  disabled={rolePending}
                  className="min-h-11 w-full rounded-lg border border-control bg-panel px-3 py-2 text-sm text-foreground outline-none transition focus:border-focus focus:ring-2 focus:ring-focus/25"
                >
                  <option value="user">User</option>
                  <option value="admin">Administrator</option>
                </select>
              )}
            </FormField>
            <Button
              type="button"
              disabled={rolePending || !roleConfirmation}
              onClick={() => setConfirmationKind("role")}
            >
              {rolePending ? "Changing role…" : "Review role change"}
            </Button>
            <ActionMessage state={roleState} />
          </form>

          <form ref={statusFormRef} action={statusAction} className="space-y-3 rounded-xl border border-cream/10 p-4">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="isDisabled" value={user.isDisabled ? "false" : "true"} />
            <div>
              <p className="font-semibold text-foreground">Account access</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {user.isDisabled
                  ? "Re-enabling allows this account to sign in again."
                  : "Disabling blocks sign-in without deleting the account or its data."}
              </p>
            </div>
            <Button
              type="button"
              variant={user.isDisabled ? "secondary" : "danger"}
              disabled={statusPending}
              onClick={() => setConfirmationKind("status")}
            >
              {statusPending
                ? user.isDisabled ? "Re-enabling…" : "Disabling…"
                : user.isDisabled ? "Re-enable account" : "Disable account"}
            </Button>
            <ActionMessage state={statusState} />
          </form>

          <form ref={passwordFormRef} action={passwordAction} className="space-y-3 rounded-xl border border-cream/10 p-4">
            <input type="hidden" name="userId" value={user.id} />
            <div>
              <p className="font-semibold text-foreground">Temporary password</p>
              <p className="mt-1 text-sm leading-6 text-muted">Resetting takes effect immediately and signs older sessions out.</p>
            </div>
            <FormField label="New password" required error={passwordState.fieldErrors?.newPassword} description="At least 12 characters with uppercase, lowercase, and a number.">
              {(controlProps) => <Input {...controlProps} name="newPassword" type="password" autoComplete="new-password" minLength={12} disabled={passwordPending} />}
            </FormField>
            <FormField label="Confirm password" required error={passwordState.fieldErrors?.confirmPassword}>
              {(controlProps) => <Input {...controlProps} name="confirmPassword" type="password" autoComplete="new-password" minLength={12} disabled={passwordPending} />}
            </FormField>
            <Button type="button" variant="secondary" disabled={passwordPending} onClick={() => setConfirmationKind("password")}>
              {passwordPending ? "Resetting password…" : "Review password reset"}
            </Button>
            <ActionMessage state={passwordState} />
          </form>
        </div>
      </Drawer>

      {confirmation ? (
        <AlertDialog
          open
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.confirmLabel}
          tone={confirmation.tone}
          pending={pending}
          onClose={() => setConfirmationKind(null)}
          onConfirm={confirmAction}
        />
      ) : null}
    </>
  );
}
