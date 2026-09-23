import type { Metadata } from "next";
import { SignInClient } from "@/components/auth/SignInClient";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const next = searchParams.next && searchParams.next.startsWith("/") && !searchParams.next.startsWith("//") ? searchParams.next : "/analyze";
  return (
    <main className="site-main grid min-h-screen place-items-center px-6">
      <SignInClient next={next} initialError={searchParams.error ?? null} />
    </main>
  );
}
