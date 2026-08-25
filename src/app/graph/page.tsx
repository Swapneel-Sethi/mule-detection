import MuleGalaxy from "@/components/MuleGalaxy";
import type { Metadata } from "next";

export default function GraphPage() {
  return <MuleGalaxy />;
}

export const metadata: Metadata = {
  title: "Network Graph",
  description:
    "Topology-first risk graph of ML-flagged mule accounts with live money-flow corridors.",
};
