"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { ContactButton } from "@/components/ui/ContactButton";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { ProfileRow } from "@/types/database";

export function SettingsClient({ profile, email }: { profile: ProfileRow | null; email: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [org, setOrg] = useState(profile?.org ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    if (!profile) return;
    const { error } = await createBrowserSupabase().from("profiles").update({ display_name: displayName || null, org: org || null }).eq("id", profile.id);
    setMsg(error ? error.message : "Profile saved.");
  };

  const deleteAll = async () => {
    setDeleting(true);
    const r = await fetch("/api/account", { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    setDeleting(false);
    if (!r.ok) return setMsg(j.error ?? "deletion failed");
    await createBrowserSupabase().auth.signOut();
    router.replace("/");
  };

  return (
    <div className="grid max-w-3xl gap-6">
      <header><p className="label-xs">Settings</p><h1 className="text-4xl font-semibold md:text-5xl">Account</h1></header>
      <Panel title="Profile">
        <div className="grid gap-4">
          <label className="grid gap-1 text-sm"><span className="label-xs">Email</span><input className="input mono text-sm" value={email} disabled /></label>
          <label className="grid gap-1 text-sm"><span className="label-xs">Display name</span><input className="input" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} /></label>
          <label className="grid gap-1 text-sm"><span className="label-xs">Organisation</span><input className="input" value={org} maxLength={120} onChange={(e) => setOrg(e.target.value)} /></label>
          <p className="text-xs text-muted">Role: <span className="mono">{profile?.role ?? "—"}</span></p>
          <div><ContactButton onClick={save}>Save profile</ContactButton></div>
        </div>
      </Panel>
      <Panel title="Delete my data" className="border-manipulated/40">
        <p className="text-sm text-muted">Permanently deletes every case, uploaded file, overlay, report, live session, chat message and API key, then removes your account. Type <span className="mono text-fog">DELETE</span> to confirm.</p>
        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <input className="input mono" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
          <button onClick={deleteAll} disabled={confirmText !== "DELETE" || deleting}
            className="rounded-full border border-manipulated/60 px-6 py-3 text-sm text-manipulated transition hover:bg-manipulated/10 disabled:opacity-40">
            {deleting ? "Deleting…" : "Delete everything"}
          </button>
        </div>
      </Panel>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  );
}
