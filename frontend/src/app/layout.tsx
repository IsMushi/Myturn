import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "MyTurn",
  description: "Queue management and service desk status for one service desk.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-soft-mint text-ink antialiased">
        <header className="border-b border-line bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-primary" />
            <Link href="/" className="text-lg font-semibold tracking-tight text-deep-green">
              MyTurn
            </Link>
            <span className="hidden text-sm text-medium-green sm:inline">Know your turn.</span>
            <div className="ml-auto flex gap-5 text-sm font-medium text-medium-green">
              <Link href="/" className="hover:text-deep-green">
                Visitor
              </Link>
              <Link href="/screen" className="hover:text-deep-green">
                Screen
              </Link>
              <Link href="/staff" className="hover:text-deep-green">
                Staff
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
