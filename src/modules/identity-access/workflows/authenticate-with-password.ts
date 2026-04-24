import { type LoginInput } from "@/modules/identity-access/schemas/login";
import { verifyPassword } from "@/modules/users/password-hasher";
import { findUserByEmail } from "@/modules/users/repositories/user-repository";

export async function authenticateWithPassword(input: LoginInput) {
  const user = await findUserByEmail(input.email);

  if (!user || user.isDisabled) {
    return null;
  }

  if (!verifyPassword(input.password, user.passwordHash)) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}
