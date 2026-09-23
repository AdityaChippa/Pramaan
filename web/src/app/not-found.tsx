import Link from "next/link";
import { SITE } from "@/config/site";

export default function NotFound() {
  return (
    <main className="site-main flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="label-xs">{SITE.name} · 404</p>
      <h1 className="hero-heading text-[clamp(5rem,20vw,16rem)] font-black leading-[0.8]">404</h1>
      <p className="max-w-md text-muted">No evidence at this address. The page may have moved or never existed.</p>
      <Link href="/" className="rounded-full border border-hairline px-6 py-3 text-sm transition hover:border-fog/40">
        Back to {SITE.name}
      </Link>
    </main>
  );
}
