"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Copy, KeyRound, Search, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { markAuthAsked } from "@/app/actions/ads-boost";
import { Person } from "@/components/execution/ui";
import type { RescueData } from "@/lib/ads/rescue";
import { day, nfmt, rm, roiFmt } from "./ui";

const ago = (iso: string) => { const d = Math.floor((Date.now() - Date.parse(iso)) / 86400_000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };

function message(name: string, titles: string[], n: number) {
  const list = titles.slice(0, 3).map((t) => `• ${t.length > 70 ? t.slice(0, 67) + "…" : t}`).join("\n");
  const more = n > 3 ? `\n(and ${n - 3} more)` : "";
  return `Hi ${name}! 🙏\n\nYour ${n === 1 ? "video is" : "videos are"} selling really well for ALOOMA:\n${list}${more}\n\nTikTok Shop now needs your authorization to keep promoting ${n === 1 ? "it" : "them"} with ads. Could you please authorize ${n === 1 ? "it" : "them"} for Shop ads? It helps us promote ${n === 1 ? "your video" : "your videos"} much more, and you earn more commission. Thank you!\n\n———\n\nHai ${name}! 🙏\n\nVideo awak sangat laku untuk ALOOMA:\n${list}${more}\n\nTikTok Shop perlukan kebenaran (authorization) awak untuk terus promosi video ini dengan iklan. Boleh tolong authorize untuk Shop Ads? Ini bantu kami promosi video awak lebih lagi, dan awak dapat komisen lebih. Terima kasih!`;
}

/** Authorization Rescue: videos that sold in ads but are locked until the creator authorizes them again. Biggest sales first. */
export function RescueBoard({ data }: { data: RescueData }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const list = useMemo(() => data.creators.filter((c) => (!q || c.creator.toLowerCase().includes(q.toLowerCase())) && (!onlyNew || !c.askedAt)), [data.creators, q, onlyNew]);
  const max = Math.max(1, ...data.creators.map((c) => c.revenue));
  return (
    <div className="space-y-5" data-testid="ads-rescue">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Totals">
        {[["Videos Locked", nfmt(data.totalVideos), KeyRound], ["Sales They Made In Ads", rm(data.totalRevenue), UserCheck], ["Creators To Ask", nfmt(data.creators.length), UserCheck]].map(([l, v, Icon], i) => {
          const I = Icon as typeof KeyRound;
          return <motion.div key={String(l)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="rounded-2xl border border-critical/25 bg-gradient-to-br from-critical-soft to-surface p-4"><I className="size-5 text-critical" /><p className="tnum mt-1 text-[28px] leading-none font-semibold text-ink" data-testid={i === 1 ? "ads-rescue-sales" : undefined}>{String(v)}</p><p className="mt-1 text-[12.5px] font-medium text-ink-2">{String(l)}</p></motion.div>;
        })}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative"><Search className="absolute top-2.5 left-2.5 size-4 text-ink-3" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a creator" aria-label="Find a creator" className="h-9 w-56 rounded-lg border border-line-strong bg-surface pr-3 pl-8 text-[14px] text-ink focus:border-brand focus:outline-none" /></label>
        <button type="button" aria-pressed={onlyNew} onClick={() => setOnlyNew((v) => !v)} data-testid="ads-rescue-new" className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium", onlyNew ? "border-brand/50 bg-brand-soft text-brand-strong" : "border-line-strong text-ink-2 hover:bg-surface-2")}>Not asked yet</button>
        <span className="text-[12.5px] text-ink-3">{nfmt(list.length)} creator{list.length === 1 ? "" : "s"}</span>
      </div>
      {data.creators.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center" data-testid="ads-empty-state"><span className="grid size-14 place-items-center rounded-2xl bg-good-soft text-good"><Check className="size-7" /></span><p className="mt-3 text-[16px] font-semibold text-ink">No locked videos with sales</p></div>
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {list.slice(0, 100).map((c) => {
              const isOpen = open === c.creator, title = c.videos.map((v) => v.title || `Video ${v.creativeId.slice(-8)}`);
              return (
                <motion.li key={c.creator} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="overflow-hidden rounded-2xl border border-line bg-surface" data-testid="ads-rescue-creator">
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button type="button" onClick={() => setOpen(isOpen ? null : c.creator)} aria-expanded={isOpen} aria-label="Show videos" className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"><ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} /></button>
                    <Person name={c.creator} size={38} />
                    <div className="min-w-0 flex-1 basis-48">
                      {c.creator === "Creator not known" ? <p className="font-semibold text-ink">{c.creator}</p> : <Link href={`/creators/${encodeURIComponent(c.creator)}`} className="font-semibold text-ink hover:text-brand hover:underline">@{c.creator}</Link>}
                      <p className="text-[12.5px] text-ink-3">{c.videos.length} locked video{c.videos.length === 1 ? "" : "s"} · {nfmt(c.orders)} orders · ROI {roiFmt(c.roi)}</p>
                      <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-2" title="Sales compared with the top creator"><motion.span initial={{ width: 0 }} animate={{ width: `${Math.max(3, (c.revenue / max) * 100)}%` }} className="block h-full rounded-full bg-critical/70" /></div>
                    </div>
                    <p className="tnum text-right text-[18px] font-semibold text-ink">{rm(c.revenue)}<span className="block text-[11.5px] font-normal text-ink-3">sales locked</span></p>
                    <div className="flex items-center gap-2">
                      {c.askedAt && <span className="rounded-full bg-good-soft px-2.5 py-1 text-[12px] font-medium text-good" title={c.askedBy ? `Asked by ${c.askedBy}` : undefined}>Asked {ago(c.askedAt)}</span>}
                      <button type="button" data-testid="ads-rescue-copy" onClick={() => { void navigator.clipboard?.writeText(message(c.creator, title, c.videos.length)); setCopied(c.creator); setTimeout(() => setCopied(null), 1500); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium text-ink hover:bg-surface-2">{copied === c.creator ? <Check className="size-4" /> : <Copy className="size-4" />}{copied === c.creator ? "Copied" : "Copy Message"}</button>
                      <button type="button" disabled={busy} data-testid="ads-rescue-asked" onClick={() => start(async () => { await markAuthAsked(c.creator, c.videos.length); router.refresh(); })} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-white hover:bg-brand-strong disabled:opacity-60"><UserCheck className="size-4" />{c.askedAt ? "Asked Again" : "Mark As Asked"}</button>
                    </div>
                  </div>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-line bg-surface-2/40">
                        <ul className="divide-y divide-line">
                          {c.videos.map((v) => (
                            <li key={v.creativeId} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[13px]">
                              <Link href={`/ads/video/${encodeURIComponent(v.creativeId)}`} className="min-w-0 flex-1 basis-64 truncate font-medium text-ink hover:text-brand hover:underline" title={v.title ?? undefined}>{v.title || `Video ${v.creativeId.slice(-8)}`}</Link>
                              <span className="text-ink-3">{v.postedOn ? day(v.postedOn) : ""}</span>
                              <span className="tnum w-24 text-right text-ink-2">{nfmt(v.orders)} orders</span><span className="tnum w-24 text-right font-medium text-ink">{rm(v.revenue)}</span><span className="tnum w-14 text-right font-semibold text-good">{roiFmt(v.roi)}</span>
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      <p className="text-[12.5px] text-ink-3">These videos are locked by TikTok (status Authorization needed). Only the creator can authorize them again. This page never sends anything: copy the message and send it yourself, then press Mark As Asked.</p>
    </div>
  );
}
