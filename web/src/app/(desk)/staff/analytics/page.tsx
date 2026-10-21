import type { Metadata } from "next";

import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export const metadata: Metadata = {
  title: "Queue analytics — MyTurn",
  description: "Real-time queue metrics, desk performance, and 7-day trends.",
};

export default function AnalyticsPage() {
  return <AnalyticsDashboard />;
}
