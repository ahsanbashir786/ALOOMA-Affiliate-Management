"use client";

import { useState, useTransition } from "react";
import { findCreators } from "@/app/actions/outreach";
import { Button } from "@/components/ui/primitives";
import { fmtCompact } from "@/lib/utils";

export type Found = { id: string | null; username: string | null; nickname: string | null; followers: number | null; gmv: number | null; units: number | null; category: string | null; avgVideoViews: number | null; avgLiveViewers: number | null; region: string | null; avatar: string | null };
const GMV = [{ key: "GMV_RANGE_100_1000", label: "RM 100 – 1,000" }, { key: "GMV_RANGE_1000_10000", label: "RM 1,000 – 10,000" }, { key: "GMV_RANGE_10000_AND_ABOVE", label: "RM 10,000+" }];

/** TikTok's picture, shown as it is (it comes from TikTok's own picture server, so Next's image optimiser is not used). */
function Avatar({ url }: { url: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="size-10 shrink-0 rounded-full bg-surface-2 object-cover" referrerPolicy="no-referrer" />;
}

function List({ rows }: { rows: Found[] }) {
  if (!rows.length) return <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">TikTok returned no creators for this search.</p>;
  return (
    <ul data-testid="tiktok-creators">
      {rows.map((c, i) => (
        <li key={c.id ?? `${c.username}-${i}`} className="flex items-start gap-3 border-t border-line px-5 py-3 text-[13.5px]">
          {c.avatar ? <Avatar url={c.avatar} /> : <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] text-ink-3">{(c.username ?? c.nickname ?? "?").slice(0, 2).toUpperCase()}</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{c.username ? `@${c.username}` : c.nickname ?? "Name not given by TikTok"}{c.username && c.nickname ? <span className="ml-2 font-normal text-ink-3">{c.nickname}</span> : null}</p>
            <p className="tnum mt-0.5 text-[12.5px] text-ink-2">
              {[c.followers != null ? `${fmtCompact(c.followers)} followers` : null, c.gmv != null ? `RM ${fmtCompact(c.gmv)} sales (30 days)` : null, c.units != null ? `${fmtCompact(c.units)} sold` : null, c.avgVideoViews != null ? `${fmtCompact(c.avgVideoViews)} average video views` : null, c.avgLiveViewers != null ? `${fmtCompact(c.avgLiveViewers)} average LIVE viewers` : null].filter(Boolean).join(" · ") || "No figures given"}
            </p>
            {(c.category || c.region) && <p className="text-[12px] text-ink-3">{[c.category, c.region].filter(Boolean).join(" · ")}</p>}
          </div>
          {c.username && <a href={`https://www.tiktok.com/@${c.username}`} target="_blank" rel="noreferrer" className="shrink-0 text-[13px] font-semibold text-brand hover:underline">Open On TikTok</a>}
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
      {noNames && <p className="mx-5 mb-3 rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-ink-2" data-testid="fields-seen">TikTok did not send a username or name for these creators. Fields it did send: <b>{fieldsSeen.join(", ") || "none"}</b>. Send me this line if names should be there.</p>}
      <List rows={rows} />
    </div>
  );
}
