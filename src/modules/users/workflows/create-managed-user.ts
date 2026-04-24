import { createAuditEvent, createUser, findUserByEmail } from "@/modules/users/repositories/user-repository";
import { hashPassword } from "@/modules/users/password-hasher";
import { type CreateManagedUserInput } from "@/modules/users/schemas/admin-user";

type CreateManagedUserResult =
  | { ok: true; message: string }
  | { ok: false; message: string; field?: "email" | "password" | "confirmPassword" };

export async function createManagedUser(
  actorUserId: string,
  input: CreateManagedUserInput,
): Promise<CreateManagedUserResult> {
  const existingUser = await findUserByEmail(input.email);

  if (existingUser) {
    return {
      ok: false,
      message: "An account with that email already exists.",
      field: "email",
    };
  }

  const createdUser = await createUser({
    email: input.email,
    displayName: input.displayName,
    passwordHash: hashPassword(input.password),
    role: input.role,
  });

  if (!createdUser) {
    return {
      ok: false,
      message: "Unable to create the user account.",
    };
  }

  await createAuditEvent({
    actorUserId,
    eventType: "users.created",
    subjectType: "user",
    subjectId: createdUser.id,
    payloadJson: JSON.stringify({
      email: createdUser.email,
      role: createdUser.role,
    }),
  });

  return {
    ok: true,
    message: `${createdUser.displayName} created.`,
  };
}
