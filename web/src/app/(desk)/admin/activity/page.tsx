import type { Metadata } from "next";

import { AdminActivity } from "@/components/AdminActivity";
import { AccountGate } from "@/components/console/AccountGate";

export const metadata: Metadata = {
  title: "Activity — MyTurn",
  description: "What the waiting list, the desk and the accounts have recorded, newest first.",
};

export default function AdminActivityPage() {
  return (
    <AccountGate adminOnly title="Activity">
      <AdminActivity />
    </AccountGate>
  );
}
