import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Single shared password, stored as an HTTP-only cookie holding the password
// value itself — good enough for a low-stakes single-user admin panel; see
// src/app/admin/login/page.tsx for where the cookie gets set.
const ADMIN_COOKIE = "admin_session";

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === "/admin/login") {
    return NextResponse.next();
  }

  const expected = process.env.ADMIN_PASSWORD;
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;

  if (!expected || cookie !== expected) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
