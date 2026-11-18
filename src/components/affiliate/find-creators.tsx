"use client";

import { useState, useTransition } from "react";
import { findCreators } from "@/app/actions/outreach";
import { Button } from "@/components/ui/primitives";
import { fmtCompact } from "@/lib/utils";

export type Found = { id: string | null; username: string | null; nickname: string | null; followers: number | null; gmv: number | null; units: number | null; category: string | null };
const GMV = [{ key: "GMV_RANGE_100_1000", label: "RM 100 – 1,000" }, { key: "GMV_RANGE_1000_10000", label: "RM 1,000 – 10,000" }, { key: "GMV_RANGE_10000_AND_ABOVE", label: "RM 10,000+" }];

function List({ rows }: { rows: Found[] }) {
  if (!rows.length) return <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">TikTok returned no creators for this search.</p>;
  return (
    <ul data-testid="tiktok-creators">
      {rows.map((c, i) => (
        <li key={c.id ?? `${c.username}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 border-t border-line px-5 py-3 text-[13.5px] sm:grid-cols-[minmax(160px,1.2fr)_100px_120px_90px_auto]">
          <div className="min-w-0"><p className="truncate font-semibold text-ink">{c.username ? `@${c.username}` : c.nickname ?? "Creator"}</p>{c.nickname && c.username && <p className="truncate text-[12px] text-ink-3">{c.nickname}</p>}</div>
          <p className="tnum hidden text-ink-2 sm:block">{c.followers != null ? `${fmtCompact(c.followers)} followers` : "–"}</p>
          <p className="tnum hidden text-ink-2 sm:block">{c.gmv != null ? `RM ${fmtCompact(c.gmv)} (30 days)` : "–"}</p>
          <p className="tnum hidden text-ink-2 sm:block">{c.units != null ? `${fmtCompact(c.units)} sold` : "–"}</p>
          {c.username ? <a href={`https://www.tiktok.com/@${c.username}`} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-brand hover:underline">Open On TikTok</a> : <span />}
        </li>
      ))}
    </ul>
  );
}

/** Creators from TikTok's own Creator Marketplace, with a search. */
export function FindCreators({ initial, fieldsSeen }: { initial: Found[]; fieldsSeen: string[] }) {
  const [rows, setRows] = useState<Found[]>(initial);
  const [kw, setKw] = useState("");
  const [gmv, setGmv] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const run = () => start(async () => { const r = await findCreators(kw, gmv); if (r.ok) { setRows(r.creators); setErr(""); } else setErr(r.error); });
  const noNames = rows.length > 0 && rows.every((r) => !r.username && !r.nickname);
  return (
    <div>
      <form className="flex flex-wrap items-center gap-2 px-5 pb-3" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Keyword or username" aria-label="Keyword" className="h-9 w-56 rounded-lg border border-line bg-surface px-3 text-[13.5px]" />
        {GMV.map((g) => <button key={g.key} type="button" aria-pressed={gmv.includes(g.key)} onClick={() => setGmv((c) => (c.includes(g.key) ? c.filter((x) => x !== g.key) : [...c, g.key]))} className={`h-8 rounded-full border px-3 text-[13px] ${gmv.includes(g.key) ? "border-brand/40 bg-brand-soft text-brand" : "border-line text-ink-2 hover:bg-surface-2"}`}>{g.label}</button>)}
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Searching…" : "Search TikTok"}</Button>
      </form>
      {err && <p className="px-5 pb-3 text-[13px] text-critical" data-testid="tiktok-error">{err}</p>}
      <List rows={rows} />
      {noNames && <p className="px-5 py-3 text-[12px] text-ink-3">TikTok answered, but its field names differ from what we expected. Fields seen: {fieldsSeen.join(", ")}. Send this to me and I will match them.</p>}
    </div>
  );
}
