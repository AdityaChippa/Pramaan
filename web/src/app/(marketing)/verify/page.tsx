import type { Metadata } from "next";
import { VerifyClient } from "@/components/verify/VerifyClient";
import { SITE } from "@/config/site";

export const metadata: Metadata = { title: "Verify", description: `Check whether a file matches a registered ${SITE.name} case.` };

export default function VerifyPage({ searchParams }: { searchParams: { sha256?: string } }) {
  return (
    <section className="mx-auto max-w-3xl px-5 pb-24 pt-36">
      <p className="label-xs">Public verification</p>
      <h1 className="hero-heading text-5xl font-semibold md:text-7xl">VERIFY</h1>
      <p className="mt-4 max-w-xl text-muted">
        Confirm that a file is byte-identical to evidence analyzed by {SITE.name}. Only the verdict, hash and timestamps of cases their owners marked shareable are disclosed.
      </p>
      <div className="mt-10"><VerifyClient initialHash={searchParams.sha256 ?? ""} /></div>
    </section>
  );
}
