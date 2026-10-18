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
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              MyTurn
            </Link>
            <span className="hidden text-sm text-slate-500 sm:inline">Know your turn.</span>
            <div className="ml-auto flex gap-5 text-sm font-medium text-slate-600">
              <Link href="/" className="hover:text-slate-900">
                Visitor
              </Link>
              <Link href="/screen" className="hover:text-slate-900">
                Screen
              </Link>
              <Link href="/staff" className="hover:text-slate-900">
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
