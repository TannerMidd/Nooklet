import { createAuditEvent, updateUserDisabledStateGuarded } from "@/modules/users/repositories/user-repository";
import { type UpdateManagedUserStatusInput } from "@/modules/users/schemas/admin-user";

type UpdateManagedUserStatusResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function updateManagedUserStatus(
  actorUserId: string,
  input: UpdateManagedUserStatusInput,
): Promise<UpdateManagedUserStatusResult> {
  const update = await updateUserDisabledStateGuarded(actorUserId, input.userId, input.isDisabled);

  if (update.status === "not_found") {
    return {
      ok: false,
      message: "User not found.",
    };
  }

  if (update.status === "self_update") {
    return {
      ok: false,
      message: "Use another admin account to change your own status.",
    };
  }

  if (update.status === "actor_not_authorized") {
    return {
      ok: false,
      message: "Your administrator session is no longer active.",
    };
  }

  if (update.status === "unchanged") {
    return {
      ok: true,
      message: input.isDisabled ? "User is already disabled." : "User is already active.",
    };
  }

  if (update.status === "last_active_admin") {
    return {
      ok: false,
      message: "Keep at least one active admin account.",
    };
  }

  if (update.status !== "updated") {
    return { ok: false, message: "The user status could not be updated." };
  }

  const updatedUser = update.user;

  await createAuditEvent({
    actorUserId,
    eventType: updatedUser.isDisabled ? "users.disabled" : "users.enabled",
    subjectType: "user",
    subjectId: updatedUser.id,
    payloadJson: JSON.stringify({
      role: updatedUser.role,
    }),
  });

  return {
    ok: true,
    message: updatedUser.isDisabled
      ? `${updatedUser.displayName} has been disabled.`
      : `${updatedUser.displayName} has been re-enabled.`,
  };
}
