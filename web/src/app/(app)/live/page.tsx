import type { Metadata } from "next";
import { LiveClient } from "@/components/live/LiveClient";

export const metadata: Metadata = { title: "Live monitor" };

export default function LivePage() {
  return <LiveClient />;
}
