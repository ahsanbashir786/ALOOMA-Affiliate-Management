"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Loader2, MessageCircle, Trash2 } from "lucide-react";
import { Button, Input, Select } from "@/components/ui/primitives";
import { deleteManualSample, updateSample } from "@/app/actions/samples";
import { cn, fmtDateShort, fmtRM } from "@/lib/utils";
import { ResultBadge, waLink } from "./result-badge";

export type SampleRowData = {
  id: number;
  source: string;
  creator: string | null;
  buyerMasked: string | null;
  creatorMatch: string | null;
  phone: string | null;
  sku: string | null;
  rawCode: string | null;
  name: string | null;
  variation: string | null;
  contents: string | null;
  quantity: number;
  requestedAt: string | null;
  approvedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  dueAt: string | null;
  postedAt: string | null;
  postLink: string | null;
  result: string;
  autoResult: string | null;
  overridden: boolean;
  contentGmv: number;
  contentOrders: number;
  ownerId: string | null;
  ownerName: string | null;
  followUpAt: string | null;
  note: string | null;
  orderSubstatus: string | null;
  trackingId: string | null;
};

const d = (s: string | null) => (s ? fmtDateShort(s) : "–");

export function SampleRow({
  s,
  team,
  canEdit,
  today,
}: {
  s: SampleRowData;
  team: { id: string; name: string }[];
  canEdit: boolean;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    ownerId: s.ownerId ?? "",
    followUpAt: s.followUpAt ?? "",
    note: s.note ?? "",
    resultOverride: s.overridden ? s.result : "",
    creator: s.creator ?? "",
    requestedAt: s.requestedAt ?? "",
  });
  const productLabel = s.name ?? s.variation ?? s.sku ?? s.rawCode ?? "Unknown";
  const overdue = s.result === "not_posted";
  const followDue = s.followUpAt != null && s.followUpAt <= today;
  const reminder = `Hi ${s.creator}, hope you're well! Your free sample (${productLabel}) was delivered on ${d(s.deliveredAt)}. We'd love to see your video – could you let us know when you plan to post?`;

  const save = () =>
    start(async () => {
      const r = await updateSample(s.id, {
        ownerId: form.ownerId || null,
        followUpAt: form.followUpAt || null,
        note: form.note || null,
        resultOverride: (form.resultOverride || null) as "posted_video" | "did_live" | "not_posted" | null,
        requestedAt: form.requestedAt || null,
        ...(form.creator !== (s.creator ?? "") ? { creator: form.creator || null } : {}),
      });
      setMsg(r.error ?? "Saved");
    });

  return (
    <Fragment>
      <tr className={cn("hover:bg-surface-2/60", open && "bg-surface-2/60")}>
        <td className="border-b border-line py-2.5 pr-1 pl-3">
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Details" className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
        </td>
        <td className="border-b border-line px-3 py-2.5 text-[13.5px]">
          {s.creator ? (
            <div className="flex items-center gap-1.5">
              <Link href={`/creators/${encodeURIComponent(s.creator)}`} className="font-medium text-ink hover:text-brand hover:underline">{s.creator}</Link>
              {s.phone && (
                <a href={waLink(s.phone, overdue ? reminder : undefined)} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${s.phone}`} className="text-good hover:opacity-80">
                  <MessageCircle className="size-4" />
                </a>
              )}
            </div>
          ) : (
            <span className="text-ink-3" title="TikTok hides the buyer's name on sample orders">{s.buyerMasked ?? "Unknown"}</span>
          )}
          {s.creatorMatch === "auto" && s.buyerMasked && <p className="text-[11.5px] text-ink-3">matched from {s.buyerMasked}</p>}
        </td>
        <td className="max-w-[260px] border-b border-line px-3 py-2.5 text-[13.5px]">
          <span className="line-clamp-1 text-ink" title={s.contents ? `Contains: ${s.contents}` : productLabel}>{productLabel}</span>
          <span className="text-[11.5px] text-ink-3">{s.sku ?? s.rawCode}{s.contents ? " · set" : ""}</span>
        </td>
        <td className="tnum border-b border-line px-3 py-2.5 text-right text-[13.5px]">{s.quantity}</td>
        <td className="tnum border-b border-line px-3 py-2.5 text-[13px] whitespace-nowrap text-ink-2">{d(s.requestedAt)}</td>
        <td className="tnum border-b border-line px-3 py-2.5 text-[13px] whitespace-nowrap text-ink-2">{d(s.approvedAt)}</td>
        <td className="tnum border-b border-line px-3 py-2.5 text-[13px] whitespace-nowrap text-ink-2">{d(s.shippedAt)}</td>
        <td className="tnum border-b border-line px-3 py-2.5 text-[13px] whitespace-nowrap text-ink-2">{d(s.deliveredAt)}</td>
        <td className={cn("tnum border-b border-line px-3 py-2.5 text-[13px] whitespace-nowrap", overdue ? "font-medium text-critical" : "text-ink-2")}>{d(s.dueAt)}</td>
        <td className="tnum border-b border-line px-3 py-2.5 text-[13px] whitespace-nowrap">
          {s.postLink ? (
            <a href={s.postLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
              {d(s.postedAt)} <ExternalLink className="size-3" />
            </a>
          ) : (
            <span className="text-ink-2">{d(s.postedAt)}</span>
          )}
        </td>
        <td className="border-b border-line px-3 py-2.5"><ResultBadge result={s.result} manual={s.overridden} /></td>
        <td className="border-b border-line px-3 py-2.5 text-[13px] whitespace-nowrap">
          <span className="text-ink-2">{s.ownerName ?? "–"}</span>
          {s.followUpAt && <p className={cn("text-[11.5px]", followDue ? "font-medium text-warn" : "text-ink-3")}>follow up {d(s.followUpAt)}</p>}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={12} className="border-b border-line bg-surface-2/50 px-5 py-4">
            <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <dt className="text-ink-3">Source</dt>
                <dd className="text-ink">{s.source === "orders" ? "TikTok free-sample order" : s.source === "manual" ? "Logged by the team" : "Staff sheet (history)"}</dd>
                {s.contents && (<><dt className="text-ink-3">Set contains</dt><dd className="text-ink">{s.contents}</dd></>)}
                {s.orderSubstatus && (<><dt className="text-ink-3">Order status</dt><dd className="text-ink">{s.orderSubstatus}</dd></>)}
                {s.trackingId && (<><dt className="text-ink-3">Tracking</dt><dd className="tnum text-ink">{s.trackingId}</dd></>)}
                {s.overridden && s.autoResult && (<><dt className="text-ink-3">Automatic check</dt><dd><ResultBadge result={s.autoResult} /></dd></>)}
                <dt className="text-ink-3">Sales after delivery</dt>
                <dd className="tnum text-ink">{s.contentGmv > 0 ? `${fmtRM(s.contentGmv)} · ${s.contentOrders} orders` : "–"}</dd>
                {s.phone && (<><dt className="text-ink-3">WhatsApp</dt><dd><a className="text-brand hover:underline" href={waLink(s.phone)} target="_blank" rel="noopener noreferrer">{s.phone}</a></dd></>)}
              </dl>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-[12.5px] text-ink-3">Creator
                    <Input value={form.creator} disabled={!canEdit} onChange={(e) => setForm({ ...form, creator: e.target.value })} placeholder="tiktok username" className="mt-1 h-8 text-[13px]" />
                  </label>
                  <label className="text-[12.5px] text-ink-3">Person in charge
                    <Select value={form.ownerId} disabled={!canEdit} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} className="mt-1 h-8 w-full text-[13px]">
                      <option value="">Unassigned</option>
                      {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </Select>
                  </label>
                  <label className="text-[12.5px] text-ink-3">Follow-up date
                    <Input type="date" value={form.followUpAt} disabled={!canEdit} onChange={(e) => setForm({ ...form, followUpAt: e.target.value })} className="mt-1 h-8 text-[13px]" />
                  </label>
                  <label className="text-[12.5px] text-ink-3">Requested on
                    <Input type="date" value={form.requestedAt} disabled={!canEdit} onChange={(e) => setForm({ ...form, requestedAt: e.target.value })} className="mt-1 h-8 text-[13px]" />
                  </label>
                  <label className="text-[12.5px] text-ink-3 sm:col-span-2">Result
                    <Select value={form.resultOverride} disabled={!canEdit} onChange={(e) => setForm({ ...form, resultOverride: e.target.value })} className="mt-1 h-8 w-full text-[13px]">
                      <option value="">Automatic (from TikTok data)</option>
                      <option value="posted_video">Posted video (confirmed by team)</option>
                      <option value="did_live">Did LIVE (confirmed by team)</option>
                      <option value="not_posted">Not posted (confirmed by team)</option>
                    </Select>
                  </label>
                </div>
                <textarea
                  rows={2}
                  value={form.note}
                  disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="What did they say? When will they post?"
                  className="w-full rounded-lg border border-line-strong bg-surface p-2.5 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-brand"
                />
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="primary" disabled={pending} onClick={save}>
                      {pending && <Loader2 className="size-4 animate-spin" />} Save
                    </Button>
                    {s.creator && s.phone && (
                      <a href={waLink(s.phone, reminder)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-2">
                        <MessageCircle className="size-4 text-good" /> WhatsApp reminder
                      </a>
                    )}
                    {s.source === "manual" && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => deleteManualSample(s.id))}>
                        <Trash2 className="size-4" /> Delete
                      </Button>
                    )}
                    {msg && <span className={cn("text-[12.5px]", msg === "Saved" ? "text-good" : "text-critical")}>{msg}</span>}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
