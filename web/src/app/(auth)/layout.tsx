import type { ReactNode } from "react";

/**
 * The sign-in and password pages stand on their own.
 *
 * They belong to no site section, so they get no site header or footer: the
 * AuthShell already carries the logo, the pitch and the way back home, and a
 * marketing navbar above a sign-in form only invites people to wander off.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main>{children}</main>;
}
