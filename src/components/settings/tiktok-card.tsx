"use client";

import { useState, useTransition } from "react";
import { disconnectTikTok } from "@/app/actions/tiktok";
import { Badge, Button } from "@/components/ui/primitives";

type Check = { name: string; ok: boolean; message: string; count: number | null; fields: string[] };
export type TikTokView = { configured: boolean; hasAuthLink: boolean; connected: boolean; sellerName: string | null; shopName: string | null; region: string | null; scopes: string[]; connectedLabel: string | null; expiresLabel: string | null };

export function TikTokActions({ v }: { v: TikTokView }) {
  const [pending, start] = useTransition();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const test = (group?: string) =>
    start(async () => {
      setErr(null);
      const r = await fetch("/api/tiktok/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ group }) });
      const j = (await r.json().catch(() => null)) as { checks?: Check[]; error?: string } | null;
      if (!r.ok || !j?.checks) setErr(j?.error ?? "The test could not run.");
      else setChecks(j.checks);
    });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={v.connected ? "good" : v.configured ? "warn" : "critical"}>{v.connected ? "Connected" : v.configured ? "Not connected yet" : "App key and secret missing"}</Badge>
        {v.connected && <span className="text-[14px] text-ink-2">{[v.shopName ?? v.sellerName, v.region].filter(Boolean).join(" · ")}</span>}
      </div>
      {v.connected && (
        <dl className="grid gap-x-8 gap-y-1 text-[13.5px] sm:grid-cols-2">
          <div><dt className="inline text-ink-3">Connected: </dt><dd className="inline">{v.connectedLabel ?? "–"}</dd></div>
          <div><dt className="inline text-ink-3">Access renews: </dt><dd className="inline">{v.expiresLabel ?? "–"} (automatic)</dd></div>
          <div className="sm:col-span-2"><dt className="inline text-ink-3">Allowed to read: </dt><dd className="inline">{v.scopes.length ? v.scopes.join(", ") : "–"}</dd></div>
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        {v.configured && v.hasAuthLink && <a href="/api/tiktok/connect" className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:opacity-90">{v.connected ? "Reconnect" : "Connect TikTok Shop"}</a>}
        {v.connected && <Button variant="secondary" disabled={pending} onClick={() => test()}>{pending ? "Testing…" : "Run connection test"}</Button>}
        {v.connected && <Button variant="secondary" disabled={pending} onClick={() => test("affiliate")}>Test affiliate data</Button>}
        {v.connected && <Button variant="secondary" disabled={pending} onClick={() => start(async () => { await disconnectTikTok(); setChecks(null); })}>Disconnect</Button>}
      </div>
      {!v.configured && <p className="text-[13.5px] text-ink-2">Add <code>TIKTOK_APP_KEY</code> and <code>TIKTOK_APP_SECRET</code> to the private <code>.env</code> file on the server, then restart. See docs/TIKTOK-API.md.</p>}
      {v.configured && !v.hasAuthLink && <p className="text-[13.5px] text-ink-2">Add <code>TIKTOK_SERVICE_ID</code> (the app ID in Partner Center) to <code>.env</code>, then restart.</p>}
      {err && <p role="alert" className="text-[13.5px] text-critical">{err}</p>}
      {checks && (
        <ul className="space-y-3" data-testid="tiktok-checks">
          {checks.map((c) => (
            <li key={c.name} className="rounded-xl border border-line p-3.5">
              <p className="flex items-center gap-2 text-[14.5px] font-medium text-ink">{c.name}{c.path && <span className="font-mono text-[11.5px] font-normal text-ink-3">{c.path}</span>} <Badge tone={c.ok ? "good" : "critical"}>{c.ok ? "OK" : "Failed"}</Badge>{c.count != null && <span className="text-[13px] font-normal text-ink-3">{c.count} returned</span>}</p>
              {!c.ok && <p className="mt-1 text-[13.5px] text-critical">{c.message}</p>}
              {c.fields.length > 0 && <details className="mt-1.5"><summary className="cursor-pointer text-[13px] text-ink-3">{c.fields.length} fields come back (names only)</summary><p className="mt-1.5 break-words text-[12px] leading-relaxed text-ink-2">{c.fields.join(" · ")}</p></details>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
