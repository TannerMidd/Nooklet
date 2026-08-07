"use server";

import { signOut } from "@/auth";
import {
  revokeRequestAuthSession,
} from "@/modules/identity-access/workflows/revoke-request-auth-session";

export async function submitSignOutAction() {
  await revokeRequestAuthSession();
  await signOut({ redirectTo: "/login" });
}
