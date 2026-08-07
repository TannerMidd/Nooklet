import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { classifySessionAccess } from "@/modules/identity-access/session-access";

export const proxy = auth((request) => {
  const accessState = classifySessionAccess(request.auth);
  const isApiRequest = request.nextUrl.pathname.startsWith("/api/");

  if (accessState === "password_change_required") {
    if (isApiRequest) {
      return NextResponse.json(
        {
          code: "password_change_required",
          message: "Replace the temporary password before using this endpoint.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (request.nextUrl.pathname !== "/settings/account") {
      const accountUrl = new URL("/settings/account", request.nextUrl);
      accountUrl.searchParams.set("reason", "temporary-password");
      return NextResponse.redirect(accountUrl);
    }

    return NextResponse.next();
  }

  if (accessState === "ready") {
    return NextResponse.next();
  }

  if (isApiRequest) {
    return NextResponse.json(
      { code: "unauthorized", message: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const loginUrl = new URL("/login", request.nextUrl);
  loginUrl.searchParams.set(
    "callbackUrl",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: [
    "/tv/:path*",
    "/home/:path*",
    "/setup/:path*",
    "/movies/:path*",
    "/discover/:path*",
    "/search/:path*",
    "/library/:path*",
    "/history/:path*",
    "/in-progress/:path*",
    "/analytics/:path*",
    "/settings/:path*",
    "/health/:path*",
    "/admin/:path*",
    "/recommendations/:path*",
    "/api/downloads/:path*",
    "/api/service-connections/:path*",
  ],
};
