import type { Metadata } from "next";
import { KeysClient } from "@/components/keys/KeysClient";

export const metadata: Metadata = { title: "API keys" };

export default function KeysPage() {
  return <KeysClient />;
}
