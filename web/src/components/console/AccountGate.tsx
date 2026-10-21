"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { Loader2 } from "lucide-react";
import { useSession } from "@/lib/useSession";

/**
 * The gate every console section sits behind.
 *
 * The middleware only checks that a session cookie exists, so each page asks the
 * server who is signed in before it renders anything. `adminOnly` goes on top of
 * that: a staff session that opens an administration page is told where it
 * belongs instead of being shown an empty table.
 *
 * `needsAccount` separates the shared classroom password from a real account.
 * The shared session can work the queue, but it has nobody behind it, so it
 * cannot change a password or appear in the account history.
 *
 * While the check is in flight the gate keeps the section's heading and shows
 * placeholder cards for the body. A bare "checking…" line would take the title
 * off screen on a cold load, which reads as the page having gone away.
 */
export function AccountGate({
  adminOnly = false,
  needsAccount = true,
  title,
  children,
}: {
  adminOnly?: boolean;
  needsAccount?: boolean;
  /** The section's heading, kept on screen while the session is checked. */
  title: string;
  children: ReactNode;
}) {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (session.status === "out") {
      router.replace(`/auth/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [session.status, pathname, router]);

  if (session.status === "loading") {
    return (
      <div className="space-y-5" data-testid="console-loading">
        <h1 className="text-2xl font-semibold tracking-tight text-deep-green">{title}</h1>
        <p className="sr-only" role="status">
          Checking your session…
        </p>
        <div className="grid gap-5 lg:grid-cols-2">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }
  if (session.status === "out") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Loader2 size={20} className="animate-spin text-medium-green" aria-hidden="true" />
        <p className="text-sm text-medium-green">Taking you to the sign-in page…</p>
      </div>
    );
  }

  const account = session.session.user;

  if (needsAccount && !account) {
    return (
      <Notice
        title="This section belongs to an account"
        body="It is signed in with the shared classroom password, which has no account behind it. Sign in with your own address to use this page."
        href="/staff/dashboard"
        link="Back to the queue"
      />
    );
  }

  if (adminOnly && account?.role !== "admin") {
    return (
      <Notice
        title="Administrators only"
        body="This page reads the team's accounts and history. Your account works the queue from the staff dashboard instead."
        href="/staff/dashboard"
        link="Go to the staff dashboard"
      />
    );
  }

  return <>{children}</>;
}

function Notice({
  title,
  body,
  href,
  link,
}: {
  title: string;
  body: string;
  href: string;
  link: string;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl bg-white p-6 text-center">
      <h1 className="text-xl font-semibold text-deep-green">{title}</h1>
      <p className="mt-2 text-sm text-medium-green">{body}</p>
      <Link
        href={href}
        className="mt-5 inline-block rounded-full bg-deep-green px-5 py-2.5 text-sm font-semibold text-white hover:bg-medium-green"
      >
        {link}
      </Link>
    </div>
  );
}
