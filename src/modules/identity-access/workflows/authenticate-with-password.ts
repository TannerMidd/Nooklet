import { type LoginInput } from "@/modules/identity-access/schemas/login";
import { verifyPassword } from "@/modules/users/password-hasher";
import {
  clearFailedLogins,
  findUserByEmail,
  recordFailedLogin,
} from "@/modules/users/repositories/user-repository";

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export async function authenticateWithPassword(input: LoginInput) {
  const user = await findUserByEmail(input.email);

  if (!user || user.isDisabled) {
    return null;
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return null;
  }

  if (!verifyPassword(input.password, user.passwordHash)) {
    await recordFailedLogin(user.id, LOCKOUT_THRESHOLD, LOCKOUT_DURATION_MS);
    return null;
  }

  if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {
    await clearFailedLogins(user.id);
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    passwordChangedAt: user.passwordChangedAt.getTime(),
  };
}
