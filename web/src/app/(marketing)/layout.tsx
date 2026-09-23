import Link from "next/link";
import { LenisProvider } from "@/components/ui/LenisProvider";
import { Navbar } from "@/components/ui/Navbar";
import { SITE } from "@/config/site";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <LenisProvider>
      <Navbar />
      <main className="site-main min-h-screen">{children}</main>
      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-5 py-10 text-sm text-muted md:flex-row md:items-center md:justify-between md:px-10">
          <p><span className="tracking-[0.2em] text-fog">{SITE.name}</span> · {SITE.meaning} · {SITE.event}</p>
          <nav className="flex flex-wrap gap-6">
            <Link href="/verify" className="hover:text-fog">Verify</Link>
            <Link href="/model" className="hover:text-fog">Model Card</Link>
            <Link href="/docs/api" className="hover:text-fog">API</Link>
            <Link href="/auth/sign-in" className="hover:text-fog">Sign in</Link>
          </nav>
        </div>
      </footer>
    </LenisProvider>
  );
}
