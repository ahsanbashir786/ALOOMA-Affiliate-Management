import Link from "next/link";
import { CheckCircle2, Cpu, Plug, RefreshCw, Bug, TriangleAlert, OctagonAlert, Info } from "lucide-react";
import { Badge, Card } from "@/components/ui/primitives";
import { evaluateAlerts } from "@/lib/alerts/evaluate";
import { alertSummary, listAlerts, type AlertRow } from "@/lib/alerts/queries";
import type { Area, Severity } from "@/lib/alerts/checks";
import { fmtDateTimeKL } from "@/lib/time";
import { cn } from "@/lib/utils";
import { AlertButtons, AlertToolbar } from "./alert-buttons";

const AREAS: { key: Area; label: string; icon: React.ComponentType<{ className?: string }>; ok: string }[] = [
  { key: "connections", label: "Connections", icon: Plug, ok: "TikTok and Shopee logins work" },
  { key: "sync", label: "Data Sync", icon: RefreshCw, ok: "Syncs are running well" },
  { key: "server", label: "Server", icon: Cpu, ok: "Not slow or overloaded" },
  { key: "errors", label: "App Errors", icon: Bug, ok: "No errors in 24 hours" },
];
const SEV: Record<Severity, { label: string; tone: "critical" | "warn" | "brand"; Icon: React.ComponentType<{ className?: string }>; dot: string; ring: string }> = {
  critical: { label: "Critical", tone: "critical", Icon: OctagonAlert, dot: "bg-critical", ring: "border-critical/40" },
  warning: { label: "Warning", tone: "warn", Icon: TriangleAlert, dot: "bg-warn", ring: "border-warn/40" },
  info: { label: "Info", tone: "brand", Icon: Info, dot: "bg-brand", ring: "border-line" },
};

function AlertCard({ a }: { a: AlertRow }) {
  const s = SEV[a.severity];
  const area = AREAS.find((x) => x.key === a.area)!;
  return (
    <Card className={cn("p-4", a.status !== "seen" && s.ring, a.status === "seen" && "opacity-80")} data-testid="alert-card">
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", a.severity === "critical" ? "bg-critical-soft text-critical" : a.severity === "warning" ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand")}><s.Icon className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-ink">{a.title}</span>
            <Badge tone={s.tone}>{s.label}</Badge><Badge>{area.label}</Badge>
            {a.status === "seen" && <Badge>Seen</Badge>}
          </p>
          {a.detail && <p className="mt-1 text-[13.5px] break-words text-ink-2" data-testid="alert-detail">{a.detail}</p>}
          {a.advice && <p className="mt-1.5 text-[13.5px] text-ink"><b className="font-semibold">What to do:</b> {a.advice}{a.href && <> <Link href={a.href} className="font-medium text-brand hover:underline">Open</Link></>}</p>}
          <p className="mt-2 text-[12.5px] text-ink-3">First seen {fmtDateTimeKL(a.firstSeen)} · last seen {fmtDateTimeKL(a.lastSeen)}{a.area === "errors" ? ` · ${a.count} time${a.count === 1 ? "" : "s"} in 24 hours` : ""}</p>
        </div>
        <AlertButtons alertKey={a.key} status={a.status === "seen" ? "seen" : "open"} clearable={a.area === "errors"} />
      </div>
    </Card>
  );
}

/** Health at a glance, then every open problem with what to do about it. */
export async function AlertsPanel() {
  await evaluateAlerts();
  const [{ open, resolved }, sum] = await Promise.all([listAlerts(), alertSummary()]);
  return (
    <div className="space-y-5" data-testid="alerts-panel">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="health-tiles">
        {AREAS.map((a) => {
          const worst = sum.byArea[a.key];
          const n = open.filter((x) => x.area === a.key).length;
          return (
            <Card key={a.key} className="flex items-start gap-3 p-4" data-testid={`health-${a.key}`} data-status={worst ?? "ok"}>
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", !worst ? "bg-good-soft text-good" : worst === "critical" ? "bg-critical-soft text-critical" : worst === "warning" ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand")}><a.icon className="size-5" /></span>
              <div className="min-w-0">
                <p className="text-[13px] text-ink-3">{a.label}</p>
                <p className={cn("mt-0.5 flex items-center gap-1.5 text-[16px] font-semibold", !worst ? "text-good" : worst === "critical" ? "text-critical" : "text-warn")}>{!worst ? <><CheckCircle2 className="size-4" />All good</> : `${n} problem${n === 1 ? "" : "s"}`}</p>
                <p className="mt-0.5 text-[12.5px] text-ink-3">{!worst ? a.ok : worst === "critical" ? "Needs you now" : "Worth a look"}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-ink-2">Checked every 2 minutes. A problem that goes away clears by itself.</p>
        <AlertToolbar />
      </div>

      {open.length === 0 ? (
        <Card className="flex items-center gap-3 p-5" data-testid="alerts-none"><CheckCircle2 className="size-6 text-good" /><div><p className="text-[15px] font-semibold text-ink">Everything is fine</p><p className="text-[13.5px] text-ink-3">No open problems in connections, data sync, the server or the app.</p></div></Card>
      ) : (
        <div className="space-y-3">{open.map((a) => <AlertCard key={a.key} a={a} />)}</div>
      )}

      {resolved.length > 0 && (
        <details className="rounded-xl border border-line bg-surface px-4 py-3" data-testid="alerts-resolved">
          <summary className="cursor-pointer text-[14px] font-medium text-ink-2">Recently resolved ({resolved.length})</summary>
          <ul className="mt-3 divide-y divide-line">
            {resolved.map((a) => <li key={a.key} className="flex flex-wrap items-center gap-2 py-2 text-[13.5px]"><CheckCircle2 className="size-4 text-good" /><span className="font-medium text-ink">{a.title}</span><span className="ml-auto text-[12.5px] text-ink-3">resolved {a.resolvedAt ? fmtDateTimeKL(a.resolvedAt) : ""}</span></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
