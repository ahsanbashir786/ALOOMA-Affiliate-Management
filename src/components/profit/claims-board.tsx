"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { setClaimStatus } from "@/app/actions/profit";
import { Badge, Td, Th } from "@/components/ui/primitives";
import type { ClaimItem } from "@/lib/profit/claims";
import { rm } from "@/lib/profit/format";

const STATUS: Record<string, { label: string; tone: "warn" | "brand" | "good" | "neutral" }> = {
  open: { label: "To Claim", tone: "warn" }, claimed: { label: "Claimed", tone: "brand" }, recovered: { label: "Recovered", tone: "good" }, dismissed: { label: "Not Claiming", tone: "neutral" },
};

function Row({ item }: { item: ClaimItem }) {
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState(item.note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (s: string, n: string) => start(async () => { const r = await setClaimStatus(item.key, item.orderId, item.kind, item.amount, s, n); if (r.ok) { setStatus(s as ClaimItem["status"]); setErr(null); } else setErr(r.error); });
  const st = STATUS[status];
  return (
    <tr className="align-top hover:bg-surface-2/60" data-testid="claim-row">
      <Td className="whitespace-nowrap"><Link href={`/profit/order/${encodeURIComponent(item.orderId)}`} className="font-medium text-brand hover:underline">{item.orderId}</Link><span className="block text-[12px] text-ink-3">{item.day ?? ""}</span></Td>
      <Td><span className="font-medium">{item.kind}</span><span className="mt-0.5 block max-w-md text-[12.5px] text-ink-3">{item.why}</span></Td>
      <Td align="right" className="font-medium">{rm(item.amount)}</Td>
      <Td><Badge tone={st.tone}>{st.label}</Badge></Td>
      <Td>
        <div className="flex flex-wrap items-center gap-1.5">
          <select aria-label="Status" value={status} disabled={pending} onChange={(e) => save(e.target.value, note)} className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px]">
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (item.note ?? "") && save(status, note)} placeholder="Note (ticket number…)" className="h-8 w-44 rounded-md border border-line-strong bg-surface px-2 text-[13px] placeholder:text-ink-3" />
          {pending && <Loader2 className="size-4 animate-spin text-ink-3" />}
        </div>
        {err && <p className="mt-1 text-[12px] text-critical">{err}</p>}
      </Td>
    </tr>
  );
}

export function ClaimsTable({ items }: { items: ClaimItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse" data-testid="claims-table">
        <thead><tr><Th>Order</Th><Th>What</Th><Th align="right">Amount</Th><Th>Status</Th><Th>Your Action</Th></tr></thead>
        <tbody>{items.map((i) => <Row key={i.key} item={i} />)}</tbody>
      </table>
    </div>
  );
}
