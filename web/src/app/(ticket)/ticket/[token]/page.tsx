import type { Metadata } from "next";
import { Suspense } from "react";

import { TicketView } from "@/components/TicketView";

export const metadata: Metadata = {
  title: "Your ticket — MyTurn",
  description: "Follow your number in the queue from any phone.",
};

/**
 * A ticket opened from a link, for a visitor who has the address rather than
 * the phone that joined the queue.
 *
 * The token comes from the address, so this part is streamed in behind a
 * placeholder rather than holding up the rest of the page.
 */
export default function SharedTicketPage({ params }: PageProps<"/ticket/[token]">) {
  return (
    <Suspense fallback={<p className="text-medium-green">Opening your ticket…</p>}>
      <TicketFor params={params} />
    </Suspense>
  );
}

async function TicketFor({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TicketView initialToken={token} />;
}
