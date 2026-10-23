import type { Metadata } from "next";

import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { AccountGate } from "@/components/console/AccountGate";

export const metadata: Metadata = {
  title: "Visitor statistics — MyTurn",
  description: "Live waiting-line figures, service point performance, and 7-day trends.",
};

export default function AnalyticsPage() {
  return (
    <AccountGate title="Visitor statistics">
      <AnalyticsDashboard />
    </AccountGate>
  );
}
