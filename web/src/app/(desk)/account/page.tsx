import type { Metadata } from "next";

import { AccountSettings } from "@/components/AccountSettings";
import { AccountGate } from "@/components/console/AccountGate";

export const metadata: Metadata = {
  title: "Your account — MyTurn",
  description: "Change the password of the account you signed in with.",
};

export default function AccountPage() {
  return (
    <AccountGate title="Your account">
      <AccountSettings />
    </AccountGate>
  );
}
