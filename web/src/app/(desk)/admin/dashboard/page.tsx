import type { Metadata } from "next";

import { AdminDashboard } from "@/components/AdminDashboard";
import { AccountGate } from "@/components/console/AccountGate";

export const metadata: Metadata = {
  title: "Dashboard — MyTurn",
  description:
    "The waiting lines, the service points, the sensor board and the team, with the way to each administration page.",
};

export default function AdminDashboardPage() {
  return (
    <AccountGate adminOnly title="Dashboard">
      <AdminDashboard />
    </AccountGate>
  );
}
