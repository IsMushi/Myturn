import type { Metadata } from "next";

import { AdminDashboard } from "@/components/AdminDashboard";

export const metadata: Metadata = {
  title: "Administration — MyTurn",
  description: "Invite staff members and manage the accounts that can work the desk.",
};

export default function AdminDashboardPage() {
  return <AdminDashboard />;
}
