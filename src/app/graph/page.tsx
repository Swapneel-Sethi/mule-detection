import MuleGalaxy from "@/components/MuleGalaxy";
import type { Metadata } from "next";

export default function GraphPage() {
  return <MuleGalaxy />;
}

export const metadata: Metadata = {
  title: "Graph",
  description:
    "Topology-first risk graph of flagged mule accounts with money-flow corridors.",
};
