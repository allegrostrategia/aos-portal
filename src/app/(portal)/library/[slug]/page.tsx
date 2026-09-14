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
import { getCompletedContentIds } from "@/lib/library/queries";
import { Badge, Card, Eyebrow } from "@/components/ui/card";
import { CompleteButton } from "@/components/library/complete-button";

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
  const member = await requireMember();
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

  const completed = await getCompletedContentIds(member.id);
  const isLesson =
    item.kind === "training" && (item.format === "video" || item.format === "audio");

  const src = `/api/content/${item.id}`;

  // L'Editoriale "06 Lesson": the media first and full-bleed, then the title
  // and what it's about, then the completion pill. The reference's Overview /
  // Notes / Resources tabs and its key-takeaways checklist need per-lesson
  // fields that don't exist yet (a lesson has a description and nothing else
  // in that shape), so they are not drawn — see the redesign summary.
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 py-6 sm:py-10">
      <p className="mb-4">
        <Link
          href={`/stations/${item.station_slug}`}
          className="text-small text-ink/60 transition hover:text-ink"
        >
          ← {item.stations?.name ?? "Back to the station"}
        </Link>
      </p>

      <div className="mb-6">{media(item, src)}</div>

      <Eyebrow tone="accent">{KIND_LABEL[item.kind]}</Eyebrow>
      <h1 className="font-display mt-2 text-title font-medium text-ink">{item.title}</h1>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge>{FORMAT_LABEL[item.format]}</Badge>
        {item.duration_minutes ? (
          <span className="font-mono text-caption text-ink/50">
            {item.duration_minutes} min
          </span>
        ) : null}
        {item.job ? <Badge tone="gold">{JOB_LABEL[item.job]}</Badge> : null}
        {item.is_hot_seat_buildable ? (
          <Badge tone="sky">★ Buildable in a hot seat</Badge>
        ) : null}
      </div>

      {item.description ? (
        <p className="mt-5 max-w-2xl text-body text-ink/75">{item.description}</p>
      ) : null}

      {isLesson ? (
        <div className="mt-8">
          <CompleteButton
            contentId={item.id}
            contentSlug={item.slug}
            stationSlug={item.station_slug}
            initial={completed.has(item.id)}
          />
        </div>
      ) : null}
    </main>
  );
}

function media(item: TrainingContent, src: string) {
  if (!item.asset_path) {
    return (
      <Card>
        <p className="text-small text-ink/70">This one hasn&rsquo;t been uploaded yet.</p>
      </Card>
    );
  }
  return (
    <>

      {item.format === "video" ? (
        // Bounded on both axes, sized by neither.
        //
        // `w-full` alone lets width win unconditionally: a phone-recorded
        // 1080x1920 training renders the full column wide and around 1365 tall,
        // running off the bottom of the screen with its controls somewhere past
        // it. Vertical video isn't an edge case here — plenty of this content
        // gets recorded on a phone.
        //
        // Auto width inside a max-width and a max-height instead, so the browser
        // fits the video to whichever constraint binds first and keeps its real
        // aspect ratio doing it. Landscape still fills the column; portrait comes
        // out tall and narrow, inside the viewport. The file already knows its
        // own shape, so nothing needs storing or measuring.
        //
        // Deliberately not a flex child: flex resolves the main size first and
        // then clamps the cross size, so `max-h` would cap the box without
        // narrowing it and letterbox the video inside exactly the oversized
        // frame this is removing. Block layout applies both constraints together.
        <video
          controls
          controlsList="nodownload"
          className="mx-auto block max-h-[75vh] w-auto max-w-full rounded-card bg-navy shadow-lift"
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
          className="h-[75vh] w-full rounded-card border border-ink/10 bg-white shadow-soft"
        />
      ) : (
        <Card>
          <Eyebrow>Spreadsheet</Eyebrow>
          <p className="mt-2 text-small text-ink/80">
            Tools like this are meant to be opened and used in your own business,
            so this one downloads rather than streaming.
          </p>
          <p className="mt-3">
            <a
              href={src}
              className="text-small text-ink underline decoration-orange decoration-2 underline-offset-4"
            >
              Open {item.title}
            </a>
          </p>
        </Card>
      )}
    </>
  );
}
