import { redirect } from "next/navigation";

import { auth } from "@/auth";

export async function requireAdminSession() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "admin") {
    redirect("/tv");
  }

  return session;
}
