import type { Metadata } from "next";
import Link from "next/link";

import { requireMember } from "@/lib/auth/member";
import { PageHeader } from "@/components/ui/card";
import { TemplateForm } from "./template-form";

export const metadata: Metadata = { title: "Save a template — aOS" };

export default async function NewTemplatePage() {
  await requireMember();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-6 sm:py-10">
      <p className="mb-4">
        <Link href="/stations/archivio?folder=templates" className="text-small text-ink/60 transition hover:text-ink">
          ← Templates
        </Link>
      </p>
      <PageHeader
        size="title"
        title="Save a template"
        tagline="Keep what you built"
        intro="A picture of something you made in the Tools — so it's here when you need it again, not lost in a screenshots folder."
      />
      <TemplateForm />
    </main>
  );
}
