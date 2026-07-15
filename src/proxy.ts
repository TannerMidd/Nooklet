import { NextResponse } from "next/server";

import { auth } from "@/auth";

export const proxy = auth((request) => {
  if (request.auth?.user) {
    if (
      request.auth.user.mustChangePassword
      && request.nextUrl.pathname !== "/settings/account"
    ) {
      const accountUrl = new URL("/settings/account", request.nextUrl);
      accountUrl.searchParams.set("reason", "temporary-password");
      return NextResponse.redirect(accountUrl);
    }

    return NextResponse.next();
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
  ],
};
