import type { Metadata } from "next";
import Link from "next/link";
import { Check, Users } from "lucide-react";
import { can } from "@/lib/auth";
import { gate } from "@/lib/gate";
import { loadPlan, openTaskCount, syncPlan } from "@/lib/execution/plan";
import { ExecutionBoard } from "@/components/execution/board";
import { hasSyncedData } from "@/lib/creators/load";
import { loadQueue } from "@/lib/affiliate/command";
import { LEVER_LABEL, WAIT_DAYS, type Item, type Lever } from "@/lib/affiliate/actions";
import { statsOf } from "@/lib/creators/action-messages";
import { fmtDayLabel, todayKL } from "@/lib/time";
import { href, one, type SP } from "@/lib/url";
import { Badge, buttonClasses, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { InfoTip } from "@/components/ui/info-tip";
import { OpenPanelButton, OpenProductButton } from "@/components/creators/open-panel-button";
import { LineAction } from "@/components/creators/line-action";
import { Avatar } from "@/components/creators/avatar";
import { TierBadge } from "@/components/creators/tier-badge";
import { cn, fmtCompact, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Actions" };
const SIZE = 40;
const VIEWS = [{ key: "todo", label: "To Do" }, { key: "waiting", label: "Waiting For Result" }, { key: "held", label: "New Creators (Held)" }] as const;
const LEVER_TONE: Record<Lever, "brand" | "good" | "warn"> = { creators: "brand", content: "good", quality: "warn" };

function Row({ i, period }: { i: Item; period: string }) {
  const e = i.row.extra;
  const all = i.row.allLines.filter((l) => l.sampled ?? !l.noSample).map(statsOf);
  return (
    <li className="grid grid-cols-1 gap-x-4 gap-y-2 border-b border-line px-5 py-3.5 last:border-b-0 lg:grid-cols-[minmax(200px,1.1fr)_minmax(150px,0.9fr)_minmax(180px,1.4fr)_110px_90px] lg:items-start" data-testid="action-row">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={i.username} size={38} />
        <div className="min-w-0">
          <OpenPanelButton username={i.username} className="truncate text-left text-[14.5px] font-semibold text-brand hover:underline" />
          <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">{e?.followers != null ? `${fmtCompact(e.followers)} followers` : "followers not known"}{e && <TierBadge tier={e.tier} score={e.score} why={e.scoreWhy} />}</p>
        </div>
      </div>
      <div>
        <LineAction username={i.username} line={i.line} all={all} period={period} />
        {i.also > 0 && <p className="mt-0.5 text-[12px] text-ink-3">+{i.also} more {i.also === 1 ? "product" : "products"} to do (open the creator)</p>}
      </div>
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-ink">{i.product && i.pid ? <OpenProductButton pkey={i.pid} label={i.product} className="text-left hover:text-brand" /> : i.product || "No product yet"}</p>
        <p className="text-[12.5px] leading-snug text-ink-3">{i.reason}{i.days != null ? ` · ${i.status === "Quiet" ? "last sale" : "sample sent"} ${i.days} days ago` : ""}</p>
      </div>
      <div><Badge tone={LEVER_TONE[i.lever]}>{LEVER_LABEL[i.lever]}</Badge></div>
      <p className="tnum text-[14px] font-semibold text-ink lg:text-right" title="Sales (28 days) this could bring: an estimate from numbers we measured">{i.expected > 0 ? `≈ ${fmtRM(i.expected)}` : "–"}</p>
    </li>
  );
}

function Tabs({ tab, creators, plan }: { tab: "creators" | "plan"; creators: number; plan: { open: number; overdue: number } }) {
  const items = [
    { key: "creators", label: "By Creator", n: creators, sub: "one next step for each creator", href: "/affiliate/actions" },
    { key: "plan", label: "By Product", n: plan.open, sub: plan.overdue ? `${plan.overdue} overdue` : "planned actions with owners", href: "/affiliate/actions?tab=plan" },
  ] as const;
  return (
    <nav aria-label="Actions views" className="flex flex-wrap gap-3" data-testid="actions-tabs">
      {items.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === tab ? "page" : undefined} data-tab={t.key}
          className={cn("min-w-[210px] rounded-2xl border px-4 py-2.5", t.key === tab ? "border-brand/40 bg-brand-soft" : "border-line bg-surface hover:bg-surface-2")}>
          <p className={cn("text-[13.5px] font-semibold", t.key === tab ? "text-brand" : "text-ink")}>{t.label} <span className="tnum ml-1 text-[13px] font-medium text-ink-3">{t.n.toLocaleString("en-MY")}</span></p>
          <p className="text-[12px] text-ink-3">{t.sub}</p>
        </Link>
      ))}
    </nav>
  );
}

export default async function ActionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user, denied } = await gate("creators", "Actions");
  if (denied) return denied;
  if (!(await hasSyncedData())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Actions" />
        <Card><EmptyState icon={<Users className="size-5" />} title="No TikTok data yet" description="Run Data Sync first. Your actions appear as soon as creators and orders arrive." action={<Link href="/sync" className={buttonClasses({ variant: "primary" })}>Open Data Sync</Link>} /></Card>
      </div>
    );
  }
  const sp = await searchParams;
  const data = await loadQueue();
  if (!data) return null;
  const { queue, guard } = data;
  const planCount = await openTaskCount().catch(() => ({ open: 0, overdue: 0 }));
  if (one(sp.tab) === "plan") {
    const allowed = can(user, "execution");
    let plan = allowed ? await loadPlan() : null;
    if (plan && !plan.tasks.length) { try { await syncPlan(); plan = await loadPlan(); } catch (e) { console.error("Execution plan sync failed", e); } }
    return (
      <div className="space-y-6">
        <PageHeader title="Actions" description="Two views of the same work. By Creator is one next step for each creator. By Product is the plan the system writes from each product's numbers; your team assigns, does and ticks it off." />
        <Tabs tab="plan" creators={queue.todo.length} plan={planCount} />
        {plan ? <ExecutionBoard data={plan} me={user.id} meName={user.name} canManage canWork /> : <Card><EmptyState icon={<Users className="size-5" />} title="Product actions are locked for your role" description="Ask an owner to allow Execution Plan for your role." /></Card>}
      </div>
    );
  }
  const view = (VIEWS.find((v) => v.key === one(sp.view))?.key ?? "todo") as (typeof VIEWS)[number]["key"];
  const lever = (["creators", "content", "quality"].includes(one(sp.lever) ?? "") ? one(sp.lever) : "") as Lever | "";
  const prod = one(sp.product) ?? "";
  const base = queue[view].filter((i) => (!lever || i.lever === lever) && (!prod || i.pid === prod));
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const pages = Math.max(1, Math.ceil(base.length / SIZE));
  const rows = base.slice((page - 1) * SIZE, page * SIZE);
  const today = todayKL();
  const doneToday = queue.waiting.filter((i) => i.doneOn === today).length;
  const upside = queue.todo.reduce((n, i) => n + i.expected, 0);
  const count = (l: Lever) => queue[view].filter((i) => i.lever === l).length;
  const q = (extra: Record<string, string | number | undefined>) => href("/affiliate/actions", { view: view === "todo" ? undefined : view, lever: lever || undefined, product: prod || undefined, ...extra });
  const period = `Last 28 days to ${fmtDayLabel(data.ref)}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Actions" description="Two views of the same work. By Creator is one next step for each creator, biggest possible sales first; creators you have contacted wait 14 days while we see whether it worked. Click the action for a ready message." />
      <Tabs tab="creators" creators={queue.todo.length} plan={planCount} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="action-kpis">
        {[
          { label: "To Do", value: queue.todo.length.toLocaleString("en-MY"), sub: `creators ready to work${queue.held.length ? ` · +${queue.held.length.toLocaleString("en-MY")} held` : ""}` },
          { label: "Done Today", value: String(doneToday), sub: "contacted today" },
          { label: "Waiting For Result", value: queue.waiting.length.toLocaleString("en-MY"), sub: `contacted in the last ${WAIT_DAYS} days` },
          { label: "Possible Sales", value: upside > 0 ? `≈ RM ${fmtCompact(upside)}` : "–", sub: "if the To Do list works (estimate)" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-line bg-surface px-4 py-3.5">
            <p className="text-[13px] font-medium text-ink-3">{k.label}</p>
            <p className="tnum mt-0.5 text-[26px] leading-tight font-semibold tracking-tight text-ink">{k.value}</p>
            <p className="text-[12.5px] text-ink-3">{k.sub}</p>
          </div>
        ))}
      </div>

      {guard.high && (
        <div className="flex items-start gap-3 rounded-2xl border border-warn/50 bg-warn-soft px-4 py-3 text-[13.5px] text-ink" data-testid="guard-banner">
          <span className="mt-0.5 font-semibold">Chase idle samples first.</span>
          <span>{(guard.notPosted + guard.noSale).toLocaleString("en-MY")} samples already sent have not turned into sales, so new creators are held back ({queue.held.length.toLocaleString("en-MY")} waiting). <Link href="/affiliate" className="font-semibold text-brand hover:underline">See Sample Status</Link></span>
        </div>
      )}

      {prod && <p className="text-[13.5px] text-ink-2" data-testid="product-filter">Showing one product only. <Link href={href("/affiliate/actions", { view: view === "todo" ? undefined : view })} className="font-semibold text-brand hover:underline">Show all products</Link></p>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <nav aria-label="Views" className="flex flex-wrap gap-2">
            {VIEWS.filter((v) => v.key !== "held" || guard.high || queue.held.length > 0).map((v) => (
              <Link key={v.key} href={href("/affiliate/actions", { view: v.key === "todo" ? undefined : v.key, product: prod || undefined })} scroll={false} aria-current={v.key === view ? "page" : undefined}
                className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium", v.key === view ? "border-brand/40 bg-brand-soft text-brand" : "border-line bg-surface text-ink-2 hover:bg-surface-2")}>
                {v.label}<span className="tnum text-[12.5px] text-ink-3">{queue[v.key].length.toLocaleString("en-MY")}</span>
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2" aria-label="What it is for">
            <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-3">Goal<InfoTip label="About goals">Each action has one purpose: get more active creators, get more videos, or make videos sell better.</InfoTip></span>
            {(["", "creators", "content", "quality"] as const).map((l) => (
              <Link key={l || "all"} href={href("/affiliate/actions", { view: view === "todo" ? undefined : view, lever: l || undefined, product: prod || undefined })} scroll={false} aria-current={l === lever ? "page" : undefined}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium", l === lever ? "border-brand/40 bg-brand-soft text-brand" : "border-line text-ink-2 hover:bg-surface-2")}>
                {l ? LEVER_LABEL[l] : "All"}{l ? <span className="tnum text-[12px] text-ink-3">{count(l)}</span> : null}
              </Link>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-[14px] text-ink-3">
            <Check className="mx-auto mb-2 size-5 text-good" />{view === "todo" ? "Nothing left to do right now." : view === "waiting" ? "Nobody is waiting for a result." : "No new creators are held."}
          </div>
        ) : <ul data-testid="action-rows">{rows.map((i) => <Row key={i.username} i={i} period={period} />)}</ul>}
        <Pagination page={page} pages={pages} total={base.length} pageSize={SIZE} hrefFor={(p) => q({ page: p > 1 ? p : undefined })} />
      </Card>
    </div>
  );
}
