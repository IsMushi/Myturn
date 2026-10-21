import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "MyTurn — Your Turn, Made Simple.",
  description:
    "An Internet of Things queue for one service desk: take a number on your phone, watch your turn, and let the counter light tell you when the desk is free.",
};

/**
 * The document itself.
 *
 * The header and the footer belong to the public pages, so they live in the
 * layout of that group rather than here. The waiting-room display and the
 * dashboards get no marketing chrome at all.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-soft-mint text-ink antialiased">
        {/* The home page fades its sections in on the way down. Without
            scripting there is nothing to do the fading, so the sections are
            simply shown. */}
        <noscript>
          <style>{`[data-reveal] { opacity: 1 !important; transform: none !important; }`}</style>
        </noscript>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
