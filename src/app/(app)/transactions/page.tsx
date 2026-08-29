import TransactionsContent from "@/components/TransactionsContent";
import type { Metadata } from "next";

export default function TransactionsPage() {
  return <TransactionsContent />;
}

export const metadata: Metadata = {
  title: "Transactions",
  description: "Inspect every flagged transaction: amounts, counterparties, channel and risk score.",
};
