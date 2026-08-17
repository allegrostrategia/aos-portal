import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import {
  FORMAT_LABEL,
  JOB_LABEL,
  KIND_LABEL,
  type TrainingContent,
} from "@/lib/library/queries";
import { Badge, Card, Eyebrow, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "aOS" };

/**
 * A single piece of library content.
 *
 * Everything plays through /api/content/[id], which mints a short-lived signed
 * URL after checking the member may see it. Nothing here links to a file
 * directly, and the bucket has no member policy — which together are what make
 * §11's "non-exportable" a property of the system rather than a convention.
 *
 * `controlsList="nodownload"` removes the download button from the browser's own
 * player. Trivially bypassed by anyone determined, and that's fine: §11 asks for
 * the same soft protection as Kajabi or Teachable, not for a fight with the
 * viewer.
 */
export default async function ContentPage({
  params,
}: PageProps<"/library/[slug]">) {
  await requireMember();
  const { slug } = await params;

  // The member's own client: RLS decides whether this exists for them.
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_content")
    .select("*, stations(name)")
    .eq("slug", slug)
    .maybeSingle();

  const item = data as (TrainingContent & { stations: { name: string } | null }) | null;
  if (!item) notFound();

  const src = `/api/content/${item.id}`;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 py-8 sm:py-10">
      <p className="mb-4">
        <Link
          href={`/stations/${item.station_slug}`}
          className="text-small text-navy/70 underline underline-offset-4 transition hover:text-navy"
        >
          ← {item.stations?.name ?? "Back to the station"}
        </Link>
      </p>

      <PageHeader
        eyebrow={KIND_LABEL[item.kind]}
        title={item.title}
        intro={item.description ?? undefined}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge>{FORMAT_LABEL[item.format]}</Badge>
        {item.duration_minutes ? (
          <span className="font-mono text-caption text-navy/50">
            {item.duration_minutes} min
          </span>
        ) : null}
        {item.job ? <Badge tone="gold">{JOB_LABEL[item.job]}</Badge> : null}
        {item.is_hot_seat_buildable ? (
          <Badge tone="sky">★ Buildable in a hot seat</Badge>
        ) : null}
      </div>

      {!item.asset_path ? (
        <Card>
          <p className="text-small text-navy/70">
            This one hasn&rsquo;t been uploaded yet.
          </p>
        </Card>
      ) : item.format === "video" ? (
        <video
          controls
          controlsList="nodownload"
          className="w-full rounded-xl border border-navy/10 bg-navy/5"
          src={src}
        />
      ) : item.format === "audio" ? (
        <Card>
          <audio controls controlsList="nodownload" className="w-full" src={src} />
        </Card>
      ) : item.format === "pdf" ? (
        <iframe
          // #toolbar=0 asks the built-in viewer to drop its download button.
          // Honoured by some browsers and ignored by others — the real
          // protection is that the URL is short-lived and unguessable.
          src={`${src}#toolbar=0`}
          title={item.title}
          className="h-[75vh] w-full rounded-xl border border-navy/10 bg-white"
        />
      ) : (
        <Card>
          <Eyebrow>Spreadsheet</Eyebrow>
          <p className="mt-2 text-small text-navy/80">
            Tools like this are meant to be opened and used in your own business,
            so this one downloads rather than streaming.
          </p>
          <p className="mt-3">
            <a
              href={src}
              className="text-small text-navy underline decoration-orange decoration-2 underline-offset-4"
            >
              Open {item.title}
            </a>
          </p>
        </Card>
      )}
    </main>
  );
}
