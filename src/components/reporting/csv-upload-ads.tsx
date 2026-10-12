"use client";

import { useActionState, useRef, useState } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { buildCampaignPreview, type CampaignPreview } from "@/lib/reporting/csv/campaign-preview";
import { readMetaAds } from "@/lib/reporting/csv/meta-ads";
import {
  saveColumnMaps,
  type ColumnMapState,
} from "@/lib/reporting/csv/column-map-actions";

/**
 * §10.2's import, which is not "fill these boxes".
 *
 * The export is one row per campaign and this screen stores per
 * campaign, so a row has to find the campaign it belongs to. Matched by
 * **exact name** (Dom, 12 October) — no fuzzy matching and no
 * remembered mapping, because both are ways a month's spend quietly
 * lands on the wrong campaign.
 *
 * A row with no campaign is **listed, not created**. Somebody ticks the
 * ones they want and only those are made. A file mentioning a campaign
 * is not somebody asking for it to exist.
 *
 * **This card writes nothing at all.** A ticked campaign is handed to
 * the form as a pending one and created by the save, in the same action
 * as its figures — so abandoning a preview, or closing the tab, leaves
 * nothing behind. It used to create them on "Fill these in", and an
 * empty campaign is not harmless: it renders as a row on the client's
 * published report with dashes where its figures would be.
 */

export function CsvUploadAds({
  workspaceId,
  month,
  monthLabel,
  campaigns,
  current,
  labels,
  columnMaps,
  onFill,
  onAddPending,
  onImported,
}: {
  workspaceId: string;
  month: string;
  monthLabel: string;
  campaigns: { id: string; name: string }[];
  /** `${metricKey}|${campaignId}` → what is in that box now. */
  current: Record<string, number | null>;
  labels: Record<string, string>;
  columnMaps: Record<string, "leads" | "purchases" | "ignored">;
  onFill: (figures: Record<string, number>) => void;
  /** Campaigns to create when the form is saved, with their figures. */
  onAddPending: (
    pending: { name: string; goal: "leads" | null; figures: Record<string, number> }[],
  ) => void;
  /** What to record once the figures are saved (§9). */
  onImported: (what: { fileName: string; fields: string[] }) => void;
}) {
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, boolean>>({});
  const [fileName, setFileName] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // §10.2's unrecognised conversion columns, and the choices made for
  // them here. Kept locally so the preview can be re-read the moment
  // they are remembered, without a reload.
  const [unknown, setUnknown] = useState<{ column: string; label: string; total: number }[]>([]);
  const [maps, setMaps] = useState(columnMaps);
  const [text, setText] = useState<string | null>(null);
  const [choices, setChoices] = useState<
    Record<string, "leads" | "purchases" | "ignored" | "forget">
  >({});
  const [mapState, mapAction] = useActionState<ColumnMapState, FormData>(saveColumnMaps, null);

  function clear() {
    setPreview(null);
    setProblem(null);
    setAdding({});
    setUnknown([]);
    setText(null);
    setFileName(null);
    if (input.current) input.current.value = "";
  }

  /** Read the file we already have, against the choices we now have. */
  function reread(csv: string, withMaps: typeof maps) {
    const result = readMetaAds(csv, month, withMaps);
    if (result.problem) {
      setPreview(null);
      setUnknown([]);
      setProblem(result.problem);
      return;
    }
    setProblem(null);
    setAdding({});
    setUnknown(result.unknownConversions);
    setPreview(buildCampaignPreview(result.campaigns, campaigns, current, labels));
  }

  async function read(file: File) {
    const csv = await file.text();
    setFileName(file.name);
    setText(csv);
    reread(csv, maps);
  }

  // Once the choices are remembered, read the same file again against
  // them, so the preview shows what they are worth straight away rather
  // than on the next upload.
  //
  // Keyed on the notice rather than on every render: the action returns
  // a fresh object each time, and rereading on anything else would
  // fight the person as they pick.
  const [remembered, setRemembered] = useState<ColumnMapState>(null);
  if (mapState?.notice && mapState !== remembered) {
    // "Ask me again" removes the answer rather than storing one, so the
    // next upload asks — the merge has to delete, not overwrite.
    const next = { ...maps };
    for (const [column, choice] of Object.entries(choices)) {
      if (choice === "forget") delete next[column];
      else next[column] = choice;
    }
    setRemembered(mapState);
    setMaps(next);
    setChoices({});
    if (text) reread(text, next);
  }

  function fill() {
    if (!preview) return;

    const figures: Record<string, number> = {};
    for (const matched of preview.matched) {
      for (const row of matched.rows) figures[`${row.key}|${matched.entityId}`] = row.to;
    }
    onFill(figures);

    onAddPending(
      preview.unmatched
        .filter((u) => adding[u.name])
        .map((u) => ({
          name: u.name,
          goal: u.goalIsLeads ? ("leads" as const) : null,
          figures: u.figures,
        })),
    );

    onImported({
      fileName: fileName ?? "",
      fields: [
        ...new Set([
          ...preview.matched.flatMap((m) => m.rows.map((r) => r.key)),
          ...preview.unmatched
            .filter((u) => adding[u.name])
            .flatMap((u) => Object.keys(u.figures)),
        ]),
      ],
    });

    clear();
  }

  const changedCount = (preview?.matched ?? []).reduce((n, m) => n + m.changed.length, 0);

  return (
    <Card className="mb-6">
      <span hidden data-csv-upload="meta_ads" />
      <SectionTitle aside="optional">Fill from a file</SectionTitle>
      <p className="mt-2 text-body text-ink/70">
        Drop in a Meta Ads Manager export for {monthLabel}. Each row is
        matched to a campaign by name. Nothing is saved until you check
        it and press save, and the file itself is never stored.
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
        {preview || problem ? (
          <button type="button" onClick={clear} className={buttonClasses("secondary", "sm")}>
            Start again
          </button>
        ) : null}
      </div>

      {problem ? (
        <p role="alert" data-csv-problem className="mt-4 text-small text-deep-red">
          {problem}
        </p>
      ) : null}

      {/* **What has already been said, and a way to change it**
          (Dom, 12 October). Shown without a file, because somebody who
          wants to correct an answer should not have to upload
          something first. Changing one affects future uploads and
          re-reads; months already saved keep their figures. */}
      {Object.keys(maps).length > 0 ? (
        <details data-csv-remembered className="mt-5 border-t border-ink/8 pt-4">
          <summary className="cursor-pointer list-none text-small text-ink/60 underline underline-offset-4 transition hover:text-ink">
            {Object.keys(maps).length} column
            {Object.keys(maps).length === 1 ? "" : "s"} you have already set up
          </summary>
          <p className="mt-2 text-caption text-ink/55">
            Changing one of these changes what the next upload counts. A
            month you have already saved keeps the figures it has.
          </p>
          <form action={mapAction} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="workspace_id" value={workspaceId} />
            <input type="hidden" name="platform" value="meta_ads" />
            {Object.entries(maps).map(([column, choice]) => (
              <fieldset key={column} className="flex flex-wrap items-center gap-3">
                <legend className="text-small text-ink">{column}</legend>
                {(["leads", "purchases", "ignored", "forget"] as const).map((option) => (
                  <label key={option} className="flex items-center gap-1.5 text-small text-ink">
                    <input
                      type="radio"
                      name={`column:${column}`}
                      value={option}
                      defaultChecked={option === choice}
                      onChange={() =>
                        setChoices((now) => ({ ...now, [column]: option }))
                      }
                      className="size-4 accent-orange"
                    />
                    {option === "ignored"
                      ? "Neither"
                      : option === "forget"
                        ? "Ask me again"
                        : option === "leads"
                          ? "Leads"
                          : "Purchases"}
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" variant="secondary">
                Save these
              </Button>
              <p
                aria-live="polite"
                className={`text-small ${mapState?.error ? "text-deep-red" : "text-ink/60"}`}
              >
                {mapState?.error ?? mapState?.notice ?? ""}
              </p>
            </div>
          </form>
        </details>
      ) : null}

      {preview ? (
        <div className="mt-5 border-t border-ink/8 pt-4">
          <p className="text-small text-ink/60">
            {fileName} · {preview.matched.length} matched, {preview.unmatched.length} not
            recognised
          </p>

          {changedCount > 0 ? (
            <div data-csv-changed className="mt-4 rounded-xl bg-cream-deep p-4">
              <p className="text-small font-medium text-ink">
                {changedCount} figure{changedCount === 1 ? "" : "s"} already here would change
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {preview.matched.flatMap((m) =>
                  m.changed.map((row) => (
                    <li key={`${m.entityId}-${row.key}`} className="text-small text-ink">
                      {m.name} · {row.label}:{" "}
                      <span className="font-mono text-ink/60">
                        {row.status === "changed" ? row.from : ""}
                      </span>{" "}
                      <span aria-hidden>→</span>{" "}
                      <span className="font-mono">{row.to}</span>
                    </li>
                  )),
                )}
              </ul>
            </div>
          ) : null}

          {preview.matched.length > 0 ? (
            <ul data-csv-matched className="mt-4 flex flex-col gap-2">
              {preview.matched.map((m) => (
                <li key={m.entityId} className="text-small">
                  <span className="font-medium text-ink">{m.name}</span>
                  <span className="text-ink/60">
                    {" — "}
                    {m.rows.map((r) => `${r.label} ${r.to}`).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Listed, never created on sight. */}
          {preview.unmatched.length > 0 ? (
            <div data-csv-unmatched className="mt-5">
              <p className="text-small font-medium text-ink">
                Not recognised — nothing is added unless you tick it
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {preview.unmatched.map((u) => (
                  <li key={u.name}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2 transition hover:bg-cream-deep">
                      <input
                        type="checkbox"
                        checked={Boolean(adding[u.name])}
                        onChange={(event) =>
                          setAdding((now) => ({ ...now, [u.name]: event.target.checked }))
                        }
                        className="mt-1 size-4 accent-orange"
                      />
                      <span className="text-small text-ink">
                        Add <span className="font-medium">{u.name}</span> as a new campaign
                        <span className="block text-caption text-ink/55">
                          {Object.entries(u.figures)
                            .map(([key, value]) => `${labels[key] ?? key} ${value}`)
                            .join(", ")}
                          {u.goalIsLeads ? " · goal: leads" : null}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* §10.2's custom conversions. Clients name their own
              conversion events, and only they know whether a column is
              a lead, a purchase or neither — so it is never guessed.
              Remembered per workspace, so the next upload counts it. */}
          {unknown.length > 0 ? (
            <div data-csv-unknown className="mt-5 rounded-xl bg-cream-deep p-4">
              <p className="text-small font-medium text-ink">
                {unknown.length} column{unknown.length === 1 ? "" : "s"} in that file
                {unknown.length === 1 ? " is" : " are"} not set up yet
              </p>
              <p className="mt-1 text-caption text-ink/60">
                Until you say what they are, they count as nothing.
              </p>
              <form action={mapAction} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="workspace_id" value={workspaceId} />
                <input type="hidden" name="platform" value="meta_ads" />
                {unknown.map((column) => (
                  <fieldset key={column.column} className="flex flex-wrap items-center gap-3">
                    <legend className="text-small text-ink">
                      {column.label}{" "}
                      <span className="font-mono text-ink/55">{column.total}</span>
                    </legend>
                    {(["leads", "purchases", "ignored"] as const).map((choice) => (
                      <label key={choice} className="flex items-center gap-1.5 text-small text-ink">
                        <input
                          type="radio"
                          name={`column:${column.column}`}
                          value={choice}
                          defaultChecked={choice === "ignored"}
                          onChange={() =>
                            setChoices((now) => ({ ...now, [column.column]: choice }))
                          }
                          className="size-4 accent-orange"
                        />
                        {choice === "ignored" ? "Neither" : choice === "leads" ? "Leads" : "Purchases"}
                      </label>
                    ))}
                  </fieldset>
                ))}
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" size="sm" variant="secondary">
                    Remember these
                  </Button>
                  <p
                    aria-live="polite"
                    className={`text-small ${mapState?.error ? "text-deep-red" : "text-ink/60"}`}
                  >
                    {mapState?.error ?? mapState?.notice ?? ""}
                  </p>
                </div>
              </form>
            </div>
          ) : null}

          {preview.untouched.length > 0 ? (
            <p data-csv-untouched className="mt-4 text-small text-ink/60">
              The file says nothing about {preview.untouched.join(", ")} — those keep
              whatever is in them.
            </p>
          ) : null}

          <p className="mt-4 text-small text-ink/60">
            Reach is never filled: campaigns overlap, so type it from the export&rsquo;s
            summary row.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" onClick={fill}>
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
