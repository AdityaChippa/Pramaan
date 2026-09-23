"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ContactButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  size?: "md" | "lg";
}

const style: React.CSSProperties = {
  backgroundImage: "linear-gradient(123deg, #18011F 7%, #B600A8 37%, #7621B0 72%, #BE4C00 100%)",
  boxShadow: "inset 0 0 14px rgba(255,255,255,0.35), 0 10px 40px -10px rgba(182,0,168,0.55)",
  outline: "2px solid #FFFFFF",
  outlineOffset: "-3px",
};

/** Spec ContactButton — the primary gradient pill CTA, relabeled per context. */
export function ContactButton({ children, href, onClick, type = "button", disabled, className, size = "md" }: ContactButtonProps) {
  const cls = cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-full font-medium text-white transition-transform duration-300 ease-spec hover:scale-[1.03] active:scale-[0.98]",
    size === "lg" ? "px-9 py-4 text-lg" : "px-7 py-3 text-sm",
    disabled && "pointer-events-none opacity-50",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} style={style}>
      {children}
    </button>
  );
}
