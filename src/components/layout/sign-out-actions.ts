"use server";

import { signOut } from "@/auth";

export async function submitSignOutAction() {
  await signOut({ redirectTo: "/login" });
}
