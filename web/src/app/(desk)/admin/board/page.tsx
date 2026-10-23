import type { Metadata } from "next";

import { AdminBoard } from "@/components/AdminBoard";
import { AccountGate } from "@/components/console/AccountGate";

export const metadata: Metadata = {
  title: "Board — MyTurn",
  description: "Register the sensor boards and point each one at the counter it watches.",
};

export default function AdminBoardPage() {
  return (
    <AccountGate adminOnly title="Board">
      <AdminBoard />
    </AccountGate>
  );
}
