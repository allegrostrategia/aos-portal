import type { Metadata } from "next";
import Link from "next/link";

import { requireMember } from "@/lib/auth/member";
import { EMPTY_SOP } from "@/lib/sop/template";
import { PageHeader } from "@/components/ui/card";
import { SopForm } from "../sop-form";

export const metadata: Metadata = { title: "Document something — aOS" };

export default async function NewSopPage() {
  await requireMember();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-8 sm:py-10">
      <p className="mb-4">
        <Link
          href="/stations/archivio"
          className="text-small text-navy/70 underline underline-offset-4 transition hover:text-navy"
        >
          ← Archivio
        </Link>
      </p>

      <PageHeader
        eyebrow="Archivio"
        title="Document something you run"
        intro="Answer these and you've written the SOP — there's no clever step afterwards, the structure is the point. Save half of it and come back; nothing here has to be finished in one go."
      />

      <SopForm sop={EMPTY_SOP} />
    </main>
  );
}
