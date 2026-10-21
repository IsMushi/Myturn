import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * An optimistic redirect for the pages that sit behind a session, and away
 * from the auth pages when a session already exists.
 *
 * Flask names its session cookie "session", so its presence is enough to skip
 * the redirect. This is a convenience, not the protection: every request the
 * dashboard makes is answered by the API, and the API is what refuses a request
 * that carries no session.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("session");
  const isAuthPage = request.nextUrl.pathname.startsWith("/auth/");

  // Already signed in? Send them to their dashboard instead of the login page.
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL("/staff/dashboard", request.url));
  }

  // Not signed in and trying to reach a protected page? Send them to login.
  if (!hasSession && !isAuthPage) {
    const login = new URL("/auth/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/staff/dashboard", "/admin/dashboard", "/auth/:path*"],
};
