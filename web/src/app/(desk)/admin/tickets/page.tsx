import type { Metadata } from "next";

import { AccountGate } from "@/components/console/AccountGate";
import { AdminTickets } from "@/components/AdminTickets";

export const metadata: Metadata = {
  title: "Tickets — MyTurn",
  description: "Every ticket the office has issued, searchable and filterable.",
};

export default function AdminTicketsPage() {
  return (
    <AccountGate adminOnly title="Tickets">
      <AdminTickets />
    </AccountGate>
  );
}