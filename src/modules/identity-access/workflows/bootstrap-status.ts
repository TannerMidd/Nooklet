import { countAdminUsers } from "@/modules/users/repositories/user-repository";

export type BootstrapStatus = {
  isOpen: boolean;
  adminCount: number;
};

export async function getBootstrapStatus(): Promise<BootstrapStatus> {
  const adminCount = await countAdminUsers();

  return {
    isOpen: adminCount === 0,
    adminCount,
  };
}
