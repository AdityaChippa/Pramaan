"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  tone?: "dark" | "light";
  disabled?: boolean;
}

/** Spec LiveProjectButton — secondary ghost pill with a rotating arrow. */
export function LiveProjectButton({ children, href, onClick, className, tone = "dark", disabled }: Props) {
  const cls = cn(
    "group inline-flex items-center gap-3 rounded-full border px-5 py-2.5 text-sm transition-colors duration-300 ease-spec",
    tone === "dark" ? "border-hairline text-fog hover:border-fog/50 hover:bg-fog/5" : "border-ink/15 text-ink hover:border-ink/50 hover:bg-ink/5",
    disabled && "pointer-events-none opacity-50",
    className,
  );
  const inner = (
    <>
      <span>{children}</span>
      <span
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full transition-transform duration-300 ease-spec group-hover:rotate-45",
          tone === "dark" ? "bg-fog text-ink" : "bg-ink text-white",
        )}
      >
        <ArrowUpRight size={14} />
      </span>
    </>
  );
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return (
    <button type="button" onClick={onClick} className={cls} disabled={disabled}>
      {inner}
    </button>
  );
}
