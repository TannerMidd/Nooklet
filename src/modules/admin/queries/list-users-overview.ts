import { listUsers } from "@/modules/users/repositories/user-repository";

export async function listUsersOverview() {
  const users = await listUsers();

  return users.map((user) => ({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    isDisabled: user.isDisabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }));
}
