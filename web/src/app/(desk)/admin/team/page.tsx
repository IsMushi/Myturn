import type { Metadata } from "next";

import { AdminDashboard } from "@/components/AdminDashboard";

export const metadata: Metadata = {
  title: "Team & invitations — MyTurn",
  description: "Manage staff accounts, roles and invitations for the office.",
};

export default function AdminTeamPage() {
  return <AdminDashboard />;
}
