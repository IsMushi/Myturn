import Link from "next/link";

import { Logo } from "./Logo";

const COLUMNS = [
  {
    title: "MyTurn",
    links: [
      { href: "/", label: "Home" },
      { href: "/#how", label: "How It Works" },
      { href: "/#features", label: "Features" },
      { href: "/#about", label: "About" },
    ],
  },
  {
    title: "For visitors",
    links: [
      { href: "/ticket", label: "Take a ticket" },
      { href: "/display", label: "Waiting room display" },
    ],
  },
  {
    title: "For the desk",
    links: [
      { href: "/staff/dashboard", label: "Staff dashboard" },
      { href: "/admin/dashboard", label: "Administrator" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="myturn-home-footer border-t border-line bg-white">
      <div className="myturn-home-container py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-medium-green">
              Your Turn, Made Simple. Take a number, follow your place and come forward when called.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-sm font-semibold text-deep-green">
                {column.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-9 items-center text-sm text-deep-green transition hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-deep-green"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-sm text-medium-green sm:flex-row sm:items-center sm:justify-between">
          <p>© {2026} MyTurn. An Internet of Things project, INES Ruhengeri.</p>
          <p>Your Turn, Made Simple.</p>
        </div>
      </div>
    </footer>
  );
}
