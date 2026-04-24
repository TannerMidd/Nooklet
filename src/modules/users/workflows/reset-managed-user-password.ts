import { hashPassword } from "@/modules/users/password-hasher";
import { createAuditEvent, findUserById, updateUserPassword } from "@/modules/users/repositories/user-repository";
import { type ResetManagedUserPasswordInput } from "@/modules/users/schemas/admin-user";

type ResetManagedUserPasswordResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function resetManagedUserPassword(
  actorUserId: string,
  input: ResetManagedUserPasswordInput,
): Promise<ResetManagedUserPasswordResult> {
  const targetUser = await findUserById(input.userId);

  if (!targetUser) {
    return {
      ok: false,
      message: "User not found.",
    };
  }

  if (targetUser.id === actorUserId) {
    return {
      ok: false,
      message: "Use the account settings route to change your own password.",
    };
  }

  const updatedUser = await updateUserPassword(targetUser.id, hashPassword(input.newPassword));

  if (!updatedUser) {
    return {
      ok: false,
      message: "Unable to reset the password.",
    };
  }

  await createAuditEvent({
    actorUserId,
    eventType: "users.password-reset",
    subjectType: "user",
    subjectId: updatedUser.id,
  });

  return {
    ok: true,
    message: `Password reset for ${updatedUser.displayName}.`,
  };
}