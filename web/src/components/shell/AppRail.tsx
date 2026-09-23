"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Brain, FolderSearch, KeyRound, LogOut, Radio, ScanSearch, Settings } from "lucide-react";
import { SITE } from "@/config/site";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/analyze", label: "Analyze", icon: ScanSearch },
  { href: "/live", label: "Live", icon: Radio },
  { href: "/cases", label: "Cases", icon: FolderSearch },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/keys", label: "API Keys", icon: KeyRound },
  { href: "/model", label: "Model Card", icon: Brain },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppRail({ email }: { email: string }) {
  const path = usePathname();
  return (
    <aside className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-ink/95 backdrop-blur md:inset-y-0 md:left-0 md:right-auto md:w-60 md:border-r md:border-t-0">
      <div className="hidden px-6 py-6 md:block">
        <Link href="/" className="text-lg font-semibold tracking-[0.2em]">
          {SITE.name}
        </Link>
        <p className="mono mt-1 truncate text-[11px] text-muted">{email}</p>
      </div>
      <nav className="flex justify-between overflow-x-auto px-2 md:flex-col md:justify-start md:gap-1 md:px-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] transition md:flex-row md:gap-3 md:text-sm",
                active ? "bg-fog/10 text-fog" : "text-muted hover:bg-fog/5 hover:text-fog",
              )}
            >
              <Icon size={18} strokeWidth={1.6} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <form action="/auth/sign-out" method="post" className="absolute bottom-6 hidden w-full px-3 md:block">
        <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-fog/5 hover:text-fog">
          <LogOut size={18} strokeWidth={1.6} /> Sign out
        </button>
      </form>
    </aside>
  );
}
