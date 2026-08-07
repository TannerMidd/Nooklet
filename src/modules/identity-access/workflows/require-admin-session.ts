import { redirect } from "next/navigation";

import { getProtectedActionSession } from "@/modules/identity-access/workflows/get-protected-action-session";

export async function requireAdminSession() {
    const session = await getProtectedActionSession();

    if (!session?.user) {
        redirect("/login");
    }

    if (session.user.role !== "admin") {
        redirect("/tv");
    }

    return session;
}
