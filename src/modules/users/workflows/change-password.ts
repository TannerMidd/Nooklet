import { type ChangePasswordInput } from "@/modules/users/schemas/change-password";
import { hashPassword, verifyPassword } from "@/modules/users/password-hasher";
import {
  createAuditEvent,
  findUserById,
  updateUserPassword,
} from "@/modules/users/repositories/user-repository";

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      field?: "currentPassword" | "newPassword";
    };

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
): Promise<ChangePasswordResult> {
  const user = await findUserById(userId);

  if (!user || user.isDisabled) {
    return {
      ok: false,
      message: "Your account is unavailable.",
    };
  }

  if (!verifyPassword(input.currentPassword, user.passwordHash)) {
    return {
      ok: false,
      message: "Current password is incorrect.",
      field: "currentPassword",
    };
  }

  const nextPasswordHash = hashPassword(input.newPassword);

  await updateUserPassword(userId, nextPasswordHash);
  await createAuditEvent({
    actorUserId: userId,
    eventType: "users.password.changed",
    subjectType: "user",
    subjectId: userId,
  });

  return {
    ok: true,
  };
}
