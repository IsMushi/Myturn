import type { Metadata } from "next";

import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { AccountGate } from "@/components/console/AccountGate";

export const metadata: Metadata = {
  title: "Queue analytics — MyTurn",
  description: "Real-time queue metrics, desk performance, and 7-day trends.",
};

export default function AnalyticsPage() {
  return (
    <AccountGate title="Queue analytics">
      <AnalyticsDashboard />
    </AccountGate>
  );
}
