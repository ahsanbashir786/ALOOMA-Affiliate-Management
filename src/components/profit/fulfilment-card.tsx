"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { saveFulfilmentInvoice, saveFulfilmentRate } from "@/app/actions/profit";
import { Button, Card, CardHeader, Input, Td, Th } from "@/components/ui/primitives";
import { rm } from "@/lib/profit/format";

export type InvoiceRow = { month: string; pieces: number; invoice: number | null; rate: number };

export function FulfilmentCard({ rate, months }: { rate: number; months: InvoiceRow[] }) {
  const [r, setR] = useState(String(rate));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Fulfilment Cost Per Piece" description="What the warehouse charges to pack and send one piece. Used for every month that has no real invoice below." />
        <div className="flex flex-wrap items-center gap-2 px-5 pb-5">
          <span className="text-[14px] text-ink-2">RM</span>
          <Input aria-label="Fulfilment per piece" inputMode="decimal" className="w-28" value={r} onChange={(e) => setR(e.target.value)} />
          <Button variant="primary" disabled={pending} onClick={() => start(async () => { const v = Number(r.replace(",", ".")); const res = await saveFulfilmentRate(v); setMsg(res.ok ? "Saved" : res.error); })}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Save</Button>
          {msg && <span data-testid="fulfilment-msg" className="text-[13px] text-ink-2">{msg}</span>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Real 3PL Invoice By Month" description="When you receive the month's invoice, type it in. The month's fulfilment cost is then spread over its pieces. Clear it to go back to the rate above." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse" data-testid="invoice-table">
            <thead><tr><Th>Month</Th><Th align="right">Pieces Sent</Th><Th align="right">Cost Per Piece</Th><Th>Invoice (RM)</Th></tr></thead>
            <tbody>{months.map((m) => <InvoiceLine key={m.month} row={m} />)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function InvoiceLine({ row }: { row: InvoiceRow }) {
  const [v, setV] = useState(row.invoice == null ? "" : String(row.invoice));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => { const t = v.trim().replace(",", "."); const res = await saveFulfilmentInvoice(row.month, t === "" ? null : Number(t), ""); setMsg(res.ok ? "Saved" : res.error); });
  return (
    <tr>
      <Td className="font-medium">{row.month}</Td>
      <Td align="right">{row.pieces.toLocaleString("en-MY")}</Td>
      <Td align="right">{rm(row.rate)}</Td>
      <Td><div className="flex items-center gap-2"><Input aria-label={`Invoice ${row.month}`} inputMode="decimal" className="w-36" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (row.invoice == null ? "" : String(row.invoice)) && save()} placeholder="Not received" />{pending && <Loader2 className="size-4 animate-spin text-ink-3" />}{msg && <span className="text-[12.5px] text-ink-3">{msg}</span>}</div></Td>
    </tr>
  );
}
