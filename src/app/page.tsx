import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getBootstrapStatus } from "@/modules/identity-access/workflows/bootstrap-status";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [session, bootstrapStatus] = await Promise.all([
    auth(),
    getBootstrapStatus(),
  ]);

  if (session?.user) {
    redirect("/tv");
  }

  if (bootstrapStatus.isOpen) {
    redirect("/bootstrap");
  }

  redirect("/login");
}
