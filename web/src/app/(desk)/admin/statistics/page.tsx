import type { Metadata } from "next";

import { AdminStatistics } from "@/components/AdminStatistics";
import { AccountGate } from "@/components/console/AccountGate";

export const metadata: Metadata = {
  title: "Statistics — MyTurn",
  description: "Tickets issued and served, service-time distribution and the busiest hours.",
};

export default function AdminStatisticsPage() {
  return (
    <AccountGate adminOnly title="Statistics">
      <AdminStatistics />
    </AccountGate>
  );
}
