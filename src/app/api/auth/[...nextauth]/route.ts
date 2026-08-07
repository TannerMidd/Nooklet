import type { NextRequest } from "next/server";

import { handlers } from "@/auth";

function isDisabledDirectSignOut(request: NextRequest) {
    return new URL(request.url).pathname.replace(/\/+$/, "") === "/api/auth/signout";
}

function directSignOutNotFound() {
    return Response.json(
        { code: "not_found", message: "Not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
    );
}

// Application sign-out is a server action that performs durable revocation
// before Auth.js clears the cookie. Exposing the generic Auth.js endpoint would
// let its event error handling clear the cookie after a failed database write.
export function GET(request: NextRequest) {
    if (isDisabledDirectSignOut(request)) {
        return directSignOutNotFound();
    }

    return handlers.GET(request);
}

export function POST(request: NextRequest) {
    if (isDisabledDirectSignOut(request)) {
        return directSignOutNotFound();
    }

    return handlers.POST(request);
}
