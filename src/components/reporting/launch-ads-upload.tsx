"use client";

import { useRef, useState } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { readMetaAds } from "@/lib/reporting/csv/meta-ads";
import { buildPreview, type Preview } from "@/lib/reporting/csv/preview";

/**
 * A launch takes a Meta Ads export too (Nina's item 8, 19 November).
 *
 * **The Ads section's reader, unchanged.** `readMetaAds` is the same
 * function the monthly Ads screen uses, with the same column handling,
 * the same refusal when somebody hands it a content export, and the same
 * custom conversions — so a launch and a month cannot read the same file
 * differently. The two things that are this card's own:
 *
 *   · **No month to check against.** A launch is its own date range and
 *     crosses months, so the reader is called with `null` and the file's
 *     range is accepted as the launch's. That is the one line of the
 *     reader that changed today.
 *
 *   · **The figures are renamed on the way in.** The file gives
 *     `ads_spend`, `ads_link_clicks` and `ads_leads`; a launch stores
 *     `launches_ad_spend`, `launches_ad_clicks` and `launches_ad_leads`.
 *     Three figures of the export's seven, because they are the three
 *     she asked for and the others have no box on a launch.
 *
 * Nothing here saves. It reads the file in the browser, shows what it
 * would put where, fills the boxes when somebody says so, and the form's
 * own Save is still what writes — the three steps the monthly card has
 * had since §10.
 */

/** The export's names, and the launch's. Only these three cross over. */
const TAKES: Record<string, string> = {
  ads_spend: "launches_ad_spend",
  ads_link_clicks: "launches_ad_clicks",
  ads_leads: "launches_ad_leads",
};

const LABELS: Record<string, string> = {
  launches_ad_spend: "Ad spend",
  launches_ad_clicks: "Ad link clicks",
  launches_ad_leads: "Sign-ups from ads",
};

export function LaunchAdsUpload({
  current,
  onFill,
}: {
  /** What is in the three boxes now, so a change shows as old → new. */
  current: Record<string, number | null>;
  onFill: (figures: Record<string, number>) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function read(file: File) {
    const text = await file.text();
    const result = readMetaAds(text, null);

    // Renamed before the preview is built, so the list a person checks is
    // in the launch's own words rather than the file's.
    const figures: Record<string, number> = {};
    for (const [from, to] of Object.entries(TAKES)) {
      const value = result.figures[from];
      if (value !== undefined) figures[to] = value;
    }

    setFileName(file.name);
    setPreview(
      buildPreview(
        {
          ...result,
          figures,
          cannotFill: [
            "The budget and the target cost per sign-up — they are your plan, not Meta's",
          ],
        },
        current,
        LABELS,
      ),
    );
  }

  function clear() {
    setPreview(null);
    setFileName(null);
    if (input.current) input.current.value = "";
  }

  return (
    <Card className="mb-6">
      <span hidden data-csv-upload="launch_ads" />
      <SectionTitle aside="optional">Fill the ads from a file</SectionTitle>
      <p className="mt-2 text-body text-ink/70">
        Drop in a Meta Ads Manager export for this launch&rsquo;s campaigns and
        it will fill the spend, the link clicks and the sign-ups. Nothing is
        saved until you check it and press save &mdash; and the file itself is
        never stored, only the numbers you keep.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose a Meta Ads export"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void read(file);
          }}
          className="max-w-full text-small text-ink file:mr-3 file:rounded-full file:border file:border-ink/12 file:bg-card file:px-4 file:py-2 file:text-small file:text-ink"
        />
        {preview ? (
          <button type="button" onClick={clear} className={buttonClasses("secondary", "sm")}>
            Start again
          </button>
        ) : null}
      </div>

      {preview?.problem ? (
        <p role="alert" data-csv-problem className="mt-4 text-small text-deep-red">
          {preview.problem}
        </p>
      ) : null}

      {preview && !preview.problem ? (
        <div className="mt-5 border-t border-ink/8 pt-4">
          <p className="text-small text-ink/60">
            {fileName} · {preview.rowsUsed} campaign
            {preview.rowsUsed === 1 ? "" : "s"} that spent
            {preview.rowsOutsideMonth > 0 ? `, ${preview.rowsOutsideMonth} skipped` : null}
          </p>

          {preview.changed.length > 0 ? (
            <div data-csv-changed className="mt-4 rounded-xl bg-cream-deep p-4">
              <p className="text-small font-medium text-ink">
                {preview.changed.length} figure
                {preview.changed.length === 1 ? "" : "s"} already here would change
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {preview.changed.map((row) => (
                  <li key={row.key} className="text-small text-ink">
                    {row.label}:{" "}
                    <span className="font-num text-ink/60">
                      {row.status === "changed" ? row.from : ""}
                    </span>{" "}
                    <span aria-hidden>→</span> <span className="font-num">{row.to}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ul className="mt-4 flex flex-col gap-1">
            {preview.rows.map((row) => (
              <li key={row.key} className="flex justify-between gap-4 text-small">
                <span className="text-ink/70">{row.label}</span>
                <span className="font-num text-ink">{row.to}</span>
              </li>
            ))}
          </ul>

          {preview.cannotFill.length > 0 ? (
            <div className="mt-4">
              <p className="text-caption uppercase tracking-wide text-ink/55">
                You will need to type these
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {preview.cannotFill.map((line) => (
                  <li key={line} className="text-small text-ink/60">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onFill(Object.fromEntries(preview.rows.map((row) => [row.key, row.to])));
                clear();
              }}
            >
              Fill these in
            </Button>
            <p className="text-small text-ink/55">
              Still nothing saved &mdash; the boxes fill, and you press save.
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
