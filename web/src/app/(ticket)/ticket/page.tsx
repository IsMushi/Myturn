import type { Metadata } from "next";

import { TicketView } from "@/components/TicketView";

export const metadata: Metadata = {
  title: "Get your ticket — MyTurn",
  description:
    "Join the service desk waiting list in seconds and follow your turn without standing in line.",
};

export default function TicketPage() {
  return <TicketView />;
}
