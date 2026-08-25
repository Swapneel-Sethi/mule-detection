import AccountsContent from "@/components/AccountsContent";
import type { Metadata } from "next";

export default function AccountsPage() {
  return <AccountsContent />;
}

export const metadata: Metadata = {
  title: "Accounts",
  description: "Browse 8.5k+ flagged accounts — mule classifications, risk scores and behavioral flags.",
};
