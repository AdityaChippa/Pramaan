import { redirect } from "next/navigation";
import { AppRail } from "@/components/shell/AppRail";
import { PageTransition } from "@/components/shell/PageTransition";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  if (!user) redirect("/auth/sign-in");
  return (
    <div className="min-h-screen bg-ink">
      <AppRail email={user.email ?? ""} />
      <main className="site-main pb-24 md:pb-0 md:pl-60">
        <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-10 md:py-10">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
}
