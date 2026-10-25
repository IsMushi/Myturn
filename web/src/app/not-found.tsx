import Link from "next/link";

import { LogoMark } from "@/components/Logo";

const LINKS = [
  { href: "/", label: "Home", note: "Join the line or read about the service" },
  { href: "/auth/login", label: "Sign in", note: "Open the desk or administration console" },
  { href: "/display", label: "Wall display", note: "The waiting-room screen for this office" },
];

export default function NotFound() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-8 bg-soft-mint px-5 py-12 text-center"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="size-20" />
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-medium-green">Error 404</p>
      </div>

      <div className="max-w-md space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-deep-green sm:text-4xl">
          This page could not be found
        </h1>
        <p className="text-base leading-relaxed text-medium-green">
          The link may be out of date, or the page may have moved. Pick a way back below —
          nothing you were doing has been lost.
        </p>
      </div>

      <nav aria-label="Recovery links" className="flex w-full max-w-md flex-col gap-2">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-center justify-between gap-3 rounded-2xl bg-white px-5 py-3 text-left transition hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-deep-green">{link.label}</span>
              <span className="block text-xs text-medium-green">{link.note}</span>
            </span>
            <span
              aria-hidden="true"
              className="shrink-0 text-medium-green transition group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}