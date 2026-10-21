import type { ReactNode } from "react";

import { TicketPageHeader } from "@/components/ticket/TicketPageHeader";
import "@/components/ticket/ticket-pages.css";

/**
 * The pages a visitor reaches to take or to follow a ticket.
 *
 * They carry a small bar instead of the site's marketing navigation. Somebody
 * who has just scanned the code at the door has one thing to do, and offering
 * them a tour of the site instead is not helpful.
 */
export default function TicketLayout({ children }: { children: ReactNode }) {
  return (
    <div className="myturn-ticket-shell flex min-h-screen flex-col">
      <div className="print-hide">
        <TicketPageHeader />
      </div>

      <main className="myturn-ticket-main">
        {children}
      </main>

      <footer className="print-hide border-t border-line bg-soft-mint">
        <div className="myturn-ticket-footer-inner flex flex-wrap items-center gap-x-4 gap-y-1 py-5 text-xs text-deep-green">
          <p className="font-semibold text-deep-green">MyTurn — Your Turn, Made Simple.</p>
          <p>Taking a ticket needs no account and no name. A phone number or email is optional — the desk uses it only to reach you.</p>
        </div>
      </footer>
    </div>
  );
}
