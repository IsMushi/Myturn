"use client";

import { Globe, Home, TicketCheck } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/Logo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { useTicketToken } from "@/lib/useTicketToken";

const LINK =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium " +
  "text-medium-green transition hover:bg-soft-mint hover:text-deep-green sm:px-3 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green";

/**
 * The small navigation bar the ticket pages carry.
 *
 * A visitor who has just scanned the code at the door needs three things: the
 * way back, the way to their own ticket, and nothing else competing for
 * attention. The marketing navigation stays on the home page.
 *
 * On a narrow phone the bar takes two short rows — the mark and the language
 * above, the two ways out below — rather than squeezing four things onto one
 * line and wrapping the words themselves.
 */
export function TicketPageHeader({ showLanguage = false }: { showLanguage?: boolean }) {
  const [token] = useTicketToken();

  return (
    <header className="border-b border-line bg-white">
      <div className="myturn-ticket-header-inner flex flex-wrap items-center gap-x-2 gap-y-1 py-4">
        <Link
          href="/"
          aria-label="MyTurn home"
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
        >
          <Logo />
        </Link>

        {showLanguage && (
          <span className="ml-auto flex items-center">
            <LanguagePicker />
          </span>
        )}

        <nav
          aria-label="Ticket"
          className={`flex w-full items-center gap-1 ${showLanguage ? "sm:ml-2" : "sm:ml-auto"} sm:w-auto`}
        >
          <Link href="/" className={LINK}>
            <Home className="size-4 shrink-0" aria-hidden="true" />
            Back to Home
          </Link>

          {token && (
            <Link href={`/ticket/${encodeURIComponent(token)}`} className={LINK}>
              <TicketCheck className="size-4 shrink-0" aria-hidden="true" />
              Track Ticket
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

/**
 * The language the page is read in.
 *
 * English is the only language the wording has been written in.
 * Kinyarwanda and French are listed as available options.
 */
function LanguagePicker() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl border border-line px-2.5 py-1.5">
      <Globe className="size-4 shrink-0 text-medium-green" aria-hidden="true" />
      <label className="sr-only" htmlFor="ticket-language">
        Language
      </label>
      <Select defaultValue="en">
        <SelectTrigger
          id="ticket-language"
          className="h-auto w-auto gap-1 border-0 bg-transparent px-0 py-0 text-sm font-medium text-deep-green focus:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">English</SelectItem>
          <SelectItem value="rw">Kinyarwanda</SelectItem>
          <SelectItem value="fr">Français</SelectItem>
        </SelectContent>
      </Select>
    </span>
  );
}