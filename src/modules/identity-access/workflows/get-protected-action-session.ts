import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { classifySessionAccess } from "@/modules/identity-access/session-access";

/**
 * Authenticates a protected Server Action and stops temporary-password
 * sessions before domain work begins. Anonymous handling remains with each
 * action so its existing typed error response is preserved.
 */
export async function getProtectedActionSession() {
    const session = await auth();

    if (classifySessionAccess(session) === "password_change_required") {
        redirect("/settings/account?reason=temporary-password");
    }

    return session;
}
