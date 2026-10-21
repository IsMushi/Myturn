import type { Metadata } from "next";

import { AdminSettings } from "@/components/AdminSettings";
import { AccountGate } from "@/components/console/AccountGate";

export const metadata: Metadata = {
  title: "Desk settings — MyTurn",
  description: "The desk's name, description and target service time, edited while it runs.",
};

export default function AdminSettingsPage() {
  return (
    <AccountGate adminOnly title="Desk settings">
      <AdminSettings />
    </AccountGate>
  );
}
