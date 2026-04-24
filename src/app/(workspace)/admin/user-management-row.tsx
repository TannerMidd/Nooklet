"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  initialManagedUserMutationActionState,
  initialResetManagedUserPasswordActionState,
} from "@/app/(workspace)/admin/action-state";
import {
  submitResetManagedUserPasswordAction,
  submitUpdateManagedUserRoleAction,
  submitUpdateManagedUserStatusAction,
} from "@/app/(workspace)/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type UserRole } from "@/lib/database/schema";

type UserManagementRowProps = {
  currentAdminUserId: string;
  user: {
    id: string;
    displayName: string;
    role: UserRole;
    isDisabled: boolean;
  };
};

function InlineSubmitButton({
  label,
  pendingLabel,
  variant = "primary",
  disabled = false,
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={disabled || pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function UserManagementRow({ currentAdminUserId, user }: UserManagementRowProps) {
  const isCurrentAdmin = currentAdminUserId === user.id;
  const [roleState, roleAction] = useActionState(
    submitUpdateManagedUserRoleAction,
    initialManagedUserMutationActionState,
  );
  const [statusState, statusAction] = useActionState(
    submitUpdateManagedUserStatusAction,
    initialManagedUserMutationActionState,
  );
  const [passwordState, passwordAction] = useActionState(
    submitResetManagedUserPasswordAction,
    initialResetManagedUserPasswordActionState,
  );

  return (
    <div className="min-w-[320px] space-y-4">
      <form action={roleAction} className="space-y-2 rounded-2xl border border-line/70 bg-panel px-3 py-3">
        <input type="hidden" name="userId" value={user.id} />
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Role
          </span>
          <select
            name="role"
            defaultValue={user.role}
            disabled={isCurrentAdmin}
            className="min-h-11 w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <InlineSubmitButton
          label="Save role"
          pendingLabel="Saving role..."
          disabled={isCurrentAdmin}
        />
        {roleState.message ? (
          <p className={roleState.status === "success" ? "text-sm text-muted" : "text-sm text-highlight"}>
            {roleState.message}
          </p>
        ) : null}
      </form>

      <form action={statusAction} className="space-y-2 rounded-2xl border border-line/70 bg-panel px-3 py-3">
        <input type="hidden" name="userId" value={user.id} />
        <input type="hidden" name="isDisabled" value={user.isDisabled ? "false" : "true"} />
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Account status
        </div>
        <InlineSubmitButton
          label={user.isDisabled ? "Re-enable account" : "Disable account"}
          pendingLabel={user.isDisabled ? "Re-enabling..." : "Disabling..."}
          variant="secondary"
          disabled={isCurrentAdmin}
        />
        {statusState.message ? (
          <p className={statusState.status === "success" ? "text-sm text-muted" : "text-sm text-highlight"}>
            {statusState.message}
          </p>
        ) : null}
      </form>

      <form action={passwordAction} className="space-y-2 rounded-2xl border border-line/70 bg-panel px-3 py-3">
        <input type="hidden" name="userId" value={user.id} />
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Reset password
        </div>
        <Input
          name="newPassword"
          type="password"
          placeholder="New temporary password"
          disabled={isCurrentAdmin}
          aria-invalid={Boolean(passwordState.fieldErrors?.newPassword)}
        />
        {passwordState.fieldErrors?.newPassword ? (
          <p className="text-sm text-highlight">{passwordState.fieldErrors.newPassword}</p>
        ) : null}
        <Input
          name="confirmPassword"
          type="password"
          placeholder="Confirm password"
          disabled={isCurrentAdmin}
          aria-invalid={Boolean(passwordState.fieldErrors?.confirmPassword)}
        />
        {passwordState.fieldErrors?.confirmPassword ? (
          <p className="text-sm text-highlight">{passwordState.fieldErrors.confirmPassword}</p>
        ) : null}
        <InlineSubmitButton
          label="Reset password"
          pendingLabel="Resetting..."
          variant="secondary"
          disabled={isCurrentAdmin}
        />
        {passwordState.message ? (
          <p className={passwordState.status === "success" ? "text-sm text-muted" : "text-sm text-highlight"}>
            {passwordState.message}
          </p>
        ) : null}
        {isCurrentAdmin ? (
          <p className="text-sm text-muted">
            Manage your own password from the account settings route.
          </p>
        ) : null}
      </form>
    </div>
  );
}
