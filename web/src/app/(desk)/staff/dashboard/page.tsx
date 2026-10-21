import type { Metadata } from "next";

import { StaffDashboard } from "@/components/StaffDashboard";

export const metadata: Metadata = {
  title: "Service desk — MyTurn",
  description: "Call the next visitor, record what happened, and watch the board at the counter.",
};

export default function StaffDashboardPage() {
  return <StaffDashboard />;
}
