import type { Metadata } from "next";

import { AdminTeam } from "@/components/AdminTeam";
import { AccountGate } from "@/components/console/AccountGate";

export const metadata: Metadata = {
  title: "Team — MyTurn",
  description: "Manage staff accounts, roles and invitations for the office.",
};

export default function AdminTeamPage() {
  return (
    <AccountGate adminOnly title="Team">
      <AdminTeam />
    </AccountGate>
  );
}
