import type { Metadata } from "next";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { requireUser } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/database";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const { data } = user ? await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle() : { data: null };
  return <SettingsClient profile={(data ?? null) as ProfileRow | null} email={user?.email ?? ""} />;
}
