import Link from "next/link";
import { NAV_LINKS, SITE } from "@/config/site";
import { createServerSupabase } from "@/lib/supabase/server";

export async function Navbar() {
  const supabase = createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return (
    <header className="absolute inset-x-0 top-0 z-40">
      <nav className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-5 md:px-10">
        <Link href="/" className="text-lg font-semibold tracking-[0.2em]">
          {SITE.name}
        </Link>
        <ul className="hidden items-center gap-8 text-sm text-muted md:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="transition-colors hover:text-fog">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href={data.user ? "/analyze" : "/auth/sign-in"}
          className="rounded-full border border-hairline px-5 py-2 text-sm transition hover:border-fog/40"
        >
          {data.user ? "Open app" : "Sign in"}
        </Link>
      </nav>
    </header>
  );
}
