"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { ContactButton } from "@/components/ui/ContactButton";
import { Tabs } from "@/components/ui/Tabs";
import { SITE } from "@/config/site";

type Mode = "password" | "signup" | "magic";

export function SignInClient({ next, initialError }: { next: string; initialError: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createBrowserSupabase();
    try {
      if (mode === "password") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        router.replace(next);
        router.refresh();
      } else if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo(), data: { display_name: name || undefined } },
        });
        if (err) throw err;
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else setInfo("Check your inbox to confirm the account, then sign in.");
      } else {
        const { error: err } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
        if (err) throw err;
        setInfo("Magic link sent. Open it on this device to continue.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel w-full max-w-md p-8">
      <Link href="/" className="label-xs">
        ← {SITE.name}
      </Link>
      <h1 className="hero-heading mt-6 text-5xl font-bold">Investigator access</h1>
      <p className="mt-2 text-sm text-muted">Cases, evidence and reports are private to your account.</p>
      <div className="mt-6">
        <Tabs<Mode>
          tabs={[
            { id: "password", label: "Sign in" },
            { id: "signup", label: "Create account" },
            { id: "magic", label: "Magic link" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        {mode === "signup" && <input className="input" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />}
        <input className="input" type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode !== "magic" && (
          <input
            className="input"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {error && <p className="text-sm text-manipulated">{error}</p>}
        {info && <p className="text-sm text-authentic">{info}</p>}
        <ContactButton type="submit" disabled={busy} className="mt-2">
          {busy ? "Working…" : mode === "magic" ? "Send magic link" : mode === "signup" ? "Create account" : "Sign in"}
        </ContactButton>
      </form>
    </div>
  );
}
