import AccountsContent from "@/components/AccountsContent";
import type { Metadata } from "next";

export default function AccountsPage() {
  return <AccountsContent />;
}

export const metadata: Metadata = {
  title: "Accounts",
  description: "Browse 100k+ analyzed accounts — mule classifications, risk scores, KYC and behavioral flags.",
};
