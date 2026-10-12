"use client";

import { useRef, useState } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { readMetaAds } from "@/lib/reporting/csv/meta-ads";
import { readMetaContent } from "@/lib/reporting/csv/meta-content";
import { buildPreview, type Preview } from "@/lib/reporting/csv/preview";

/**
 * §10's upload card: a shortcut that fills boxes for a person to check.
 *
 * **Nothing it does is a save.** It reads the file in the browser, shows
 * what it would put where, and fills the boxes only when somebody says
 * so — and even then the form's own Save is still the thing that
 * writes. Three steps before a figure changes, on purpose: an import
 * that silently replaced a hand-typed correction would be the worst
 * kind of helpful.
 *
 * **This one genuinely needs JavaScript**, which the standing rule
 * allows for a real reason: a file cannot be read without it, and §10
 * says the headers are read in the browser so the file never leaves it.
 * Everything it fills is an ordinary box that works without it, so a
 * person with no JavaScript loses the shortcut and nothing else.
 */

export type UploadPlatform = "meta_content" | "meta_ads";

export function CsvUpload({
  platform,
  month,
  monthLabel,
  current,
  labels,
  columnMaps,
  onFill,
}: {
  platform: UploadPlatform;
  month: string;
  monthLabel: string;
  /** What is in the boxes now, so a change can be shown as old → new. */
  current: Record<string, number | null>;
  labels: Record<string, string>;
  columnMaps: Record<string, "leads" | "purchases" | "ignored">;
  onFill: (figures: Record<string, number>) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [unknown, setUnknown] = useState<{ column: string; total: number }[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function read(file: File) {
    const text = await file.text();
    const result =
      platform === "meta_content"
        ? readMetaContent(text, month)
        : readMetaAds(text, month, columnMaps);

    setFileName(file.name);
    setUnknown("unknownConversions" in result ? (result as { unknownConversions: { column: string; total: number }[] }).unknownConversions : []);
    setPreview(buildPreview(result, current, labels));
  }

  function clear() {
    setPreview(null);
    setUnknown([]);
    setFileName(null);
    if (input.current) input.current.value = "";
  }

  return (
    <Card className="mb-6">
      <span hidden data-csv-upload={platform} />
      <SectionTitle aside="optional">Fill from a file</SectionTitle>
      <p className="mt-2 text-body text-ink/70">
        Drop in {platform === "meta_ads" ? "a Meta Ads Manager export" : "a Meta Business Suite content export"}{" "}
        for {monthLabel} and it will fill what it can. Nothing is saved
        until you check it and press save — and the file itself is never
        stored, only the numbers you keep.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose a CSV export"
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
            {fileName} · {preview.rowsUsed} row{preview.rowsUsed === 1 ? "" : "s"} used
            {preview.rowsOutsideMonth > 0
              ? `, ${preview.rowsOutsideMonth} skipped`
              : null}
          </p>

          {/* The part this card exists for: a box that already holds a
              different number, shown old → new so a hand-typed
              correction is never replaced unseen. */}
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
                    <span className="font-mono text-ink/60">
                      {row.status === "changed" ? row.from : ""}
                    </span>{" "}
                    <span aria-hidden>→</span>{" "}
                    <span className="font-mono">{row.to}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ul className="mt-4 flex flex-col gap-1">
            {preview.rows.map((row) => (
              <li key={row.key} className="flex justify-between gap-4 text-small">
                <span className="text-ink/70">{row.label}</span>
                <span className="font-mono text-ink">{row.to}</span>
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

          {unknown.length > 0 ? (
            <p data-csv-unknown className="mt-4 text-small text-ink/70">
              {unknown.length} column{unknown.length === 1 ? "" : "s"} in that file
              {unknown.length === 1 ? " is" : " are"} not set up yet
              {" — "}
              {unknown.map((c) => c.column).join(", ")}. Say what they count as on
              the conversions screen and they will be counted next time.
            </p>
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
              Still nothing saved — the boxes fill, and you press save.
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
