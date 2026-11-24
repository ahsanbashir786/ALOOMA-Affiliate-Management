import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Check, CheckCircle2, Clapperboard, Gauge, Hourglass, ListTodo, Package, Sparkles, Sun, UserRound, Users, Video, Wallet } from "lucide-react";
import { StatTile } from "@/components/ui/stat-tile";
import { KIND_ICON } from "@/components/ui/icon-set";
import { can } from "@/lib/auth";
import { gate } from "@/lib/gate";
import { loadPlan, openTaskCount, syncPlan } from "@/lib/execution/plan";
import { ExecutionBoard } from "@/components/execution/board";
import { hasSyncedData } from "@/lib/creators/load";
import { loadQueue } from "@/lib/affiliate/command";
import { loadWork, staffList, type WorkItem } from "@/lib/affiliate/work";
import { HandlerPicker } from "@/components/affiliate/handler-picker";
import { LEVER_LABEL, WAIT_DAYS, type Item, type Lever } from "@/lib/affiliate/actions";
import { statsOf } from "@/lib/creators/action-messages";
import { fmtDayLabel, todayKL } from "@/lib/time";
import { href, one, type SP } from "@/lib/url";
import { Badge, buttonClasses, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { pageOf, sizeFrom } from "@/lib/paging";
import { InfoTip } from "@/components/ui/info-tip";
import { OpenPanelButton, OpenProductButton, OpenVideoButton } from "@/components/creators/open-panel-button";
import { LineAction } from "@/components/creators/line-action";
import { Avatar } from "@/components/creators/avatar";
import { TierBadge } from "@/components/creators/tier-badge";
import { cn, fmtCompact, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Actions" };
const SIZE = 20;
const VIEWS = [{ key: "todo", label: "To Do" }, { key: "waiting", label: "Waiting For Result" }, { key: "held", label: "New Creators (Held)" }] as const;
const LEVER_ICON = { creators: Users, content: Clapperboard, quality: Sparkles } as const;
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
      <div><Badge tone={LEVER_TONE[i.lever]}>{(() => { const L = LEVER_ICON[i.lever]; return <L className="mr-1 inline size-3.5" />; })()}{LEVER_LABEL[i.lever]}</Badge></div>
      <p className="tnum text-[14px] font-semibold text-ink lg:text-right" title="Sales (28 days) this could bring: an estimate from numbers we measured">{i.expected > 0 ? `≈ ${fmtRM(i.expected)}` : "–"}</p>
    </li>
  );
}

type TabKey = "today" | "creators" | "plan";
function Tabs({ tab, today, creators, plan }: { tab: TabKey; today: number; creators: number; plan: { open: number; overdue: number } }) {
  const items = [
    { key: "today", icon: Sun, label: "Today", n: today, sub: "everything to do, biggest sales first", href: "/affiliate/actions" },
    { key: "creators", icon: UserRound, label: "By Creator", n: creators, sub: "one next step for each creator", href: "/affiliate/actions?tab=creators" },
    { key: "plan", icon: Package, label: "By Product", n: plan.open, sub: plan.overdue ? `${plan.overdue} overdue` : "planned actions with owners", href: "/affiliate/actions?tab=plan" },
  ] as const;
  return (
    <nav aria-label="Actions views" className="flex flex-wrap gap-3" data-testid="actions-tabs">
      {items.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === tab ? "page" : undefined} data-tab={t.key}
          className={cn("min-w-[210px] rounded-2xl border px-4 py-2.5", t.key === tab ? "border-brand/40 bg-brand-soft" : "border-line bg-surface hover:bg-surface-2")}>
          <p className={cn("flex items-center gap-1.5 text-[13.5px] font-semibold", t.key === tab ? "text-brand" : "text-ink")}><t.icon className="size-4" />{t.label} <span className="tnum ml-1 text-[13px] font-medium text-ink-3">{t.n.toLocaleString("en-MY")}</span></p>
          <p className="text-[12px] text-ink-3">{t.sub}</p>
        </Link>
      ))}
    </nav>
  );
}

const KIND_LABEL = { creator: "Creators", task: "Product Actions", video: "Videos" } as const;

function TaskRow({ w }: { w: Extract<WorkItem, { kind: "task" }> }) {
  const t = w.task;
  return (
    <li className="grid grid-cols-1 gap-x-4 gap-y-2 border-b border-line px-5 py-3.5 last:border-b-0 lg:grid-cols-[minmax(200px,1.1fr)_minmax(150px,0.9fr)_minmax(180px,1.4fr)_110px_90px] lg:items-start" data-testid="work-row" data-kind="task">
      <div className="min-w-0"><p className="text-[14.5px] font-semibold text-ink">{t.productName ? <OpenProductButton pkey={t.productKey} label={t.productName} className="text-left hover:text-brand" /> : "Product"}</p><p className="text-[12px] text-ink-3">{t.creators ? `${t.creators.toLocaleString("en-MY")} creators · ${t.contacted} contacted` : "no creator list"}</p></div>
      <div><Link href={`/affiliate/actions?tab=plan&task=${t.id}`} className="inline-flex items-center rounded-full border border-brand bg-brand/10 px-2.5 py-0.5 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white">Open The Action</Link></div>
      <div className="min-w-0"><p className="text-[13.5px] font-medium text-ink">{t.title}</p><p className="text-[12.5px] text-ink-3">{t.dueOn ? (t.overdueDays > 0 ? <span className="font-semibold text-critical">Overdue {t.overdueDays} day{t.overdueDays === 1 ? "" : "s"}</span> : `Due ${fmtDayLabel(t.dueOn)}`) : "No due date"}</p></div>
      <div><Badge tone="neutral"><Package className="mr-1 inline size-3.5" />Product Action</Badge></div>
      <p className="tnum text-[14px] font-semibold text-ink lg:text-right">{t.impact > 0 ? `≈ ${fmtRM(t.impact)}` : "–"}</p>
    </li>
  );
}

function VideoWorkRow({ w }: { w: Extract<WorkItem, { kind: "video" }> }) {
  const v = w.video;
  return (
    <li className="grid grid-cols-1 gap-x-4 gap-y-2 border-b border-line px-5 py-3.5 last:border-b-0 lg:grid-cols-[minmax(200px,1.1fr)_minmax(150px,0.9fr)_minmax(180px,1.4fr)_110px_90px] lg:items-start" data-testid="work-row" data-kind="video">
      <div className="min-w-0">{v.creator ? <OpenPanelButton username={v.creator} className="truncate text-left text-[14.5px] font-semibold text-brand hover:underline" /> : <span className="text-[14.5px] text-ink-3">Unknown creator</span>}<p className="text-[12px] text-ink-3">{v.cls === "fading" ? "Fading video" : "Stopped selling"}</p></div>
      <div>{v.creator && <OpenPanelButton username={v.creator} label="Ask For A Fresh Video" className="inline-flex items-center rounded-full border border-brand bg-brand/10 px-2.5 py-0.5 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white" />}</div>
      <div className="min-w-0"><p className="line-clamp-2 text-[13.5px] font-medium text-ink"><OpenVideoButton id={v.id} label={v.title || "Untitled video"} className="text-left hover:text-brand" /></p><p className="text-[12.5px] text-ink-3">{v.product ? `${v.product} · ` : ""}{w.why}</p></div>
      <div><Badge tone="warn"><Video className="mr-1 inline size-3.5" />Video</Badge></div>
      <p className="tnum text-[14px] font-semibold text-ink lg:text-right" title="Sales (14 days) at risk: measured from this video's own sales">{w.value > 0 ? `≈ ${fmtRM(w.value)}` : "–"}</p>
    </li>
  );
}

export default async function ActionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user, denied } = await gate(["creators", "execution"], "Actions");
  if (denied) return denied;
  if (!(await hasSyncedData())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Actions" />
        <Card><EmptyState icon={<Users className="size-5" />} title="No TikTok data yet" description="Run Data Sync first. Your actions appear as soon as creators and orders arrive." action={<Link href="/sync" className={buttonClasses({ variant: "primary" })}>Open Data Sync</Link>} /></Card>
      </div>
    );
  }
  const sp0 = await searchParams;
  const sp: SP = can(user, "creators") ? sp0 : { ...sp0, tab: "plan" };
  const data = await loadQueue();
  if (!data) return null;
  const { queue, guard } = data;
  const planCount = await openTaskCount().catch(() => ({ open: 0, overdue: 0 }));
  const tab: TabKey = one(sp.tab) === "plan" ? "plan" : one(sp.tab) === "creators" || sp.lever || sp.product || sp.view ? "creators" : "today";
  const work = await loadWork();
  const todayN = work?.items.length ?? 0;
  if (tab === "today" && work) {
    const kind = (["creator", "task", "video"] as const).find((k) => k === one(sp.kind)) ?? "";
    const counts = { creator: 0, task: 0, video: 0 };
    for (const i of work.items) counts[i.kind]++;
    const shown = kind ? work.items.filter((i) => i.kind === kind) : work.items;
    const page = Math.max(1, Number(one(sp.page)) || 1);
    const size = sizeFrom(sp, SIZE);
    const pg = pageOf(shown, page, size);
    const pages = pg.pages, slice = pg.rows;
    const period = `Last 28 days to ${fmtDayLabel(work.ref)}`;
    const e = work.eff;
    const staff = can(user, "users") ? await staffList() : [];
    const qs = (extra: Record<string, string | number | undefined>) => href("/affiliate/actions", { kind: kind || undefined, ...extra });
    return (
      <div className="space-y-6">
        <PageHeader title="Actions" description="Everything to do in one list, biggest sales first: creators to contact, product actions and fading videos. Whoever handles the work is shown below with how much gets done." actions={staff.length > 0 ? <HandlerPicker staff={staff} value={work.handler?.id ?? ""} /> : undefined} />
        <Tabs tab="today" today={todayN} creators={queue.todo.length} plan={planCount} />
        <p className="-mt-2 text-[13px] text-ink-3" data-testid="handler-line">{work.handler ? <>All work is handled by <b className="text-ink-2">{work.handler.name}</b>. Their numbers are below. </> : <>No one is chosen yet, so the numbers are for everyone. </>}<Link href="/affiliate/team" className="font-semibold text-brand hover:underline">See Results In Team</Link></p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="today-kpis">
          <StatTile icon={CheckCircle2} tone="good" label="Done Today" value={String(e.doneToday)} note="contacts and actions finished" spark={e.byDay.map((x) => x.n)} sparkTone="good" />
          <StatTile icon={CalendarDays} tone="brand" label="Last 7 Days" value={String(e.last7)} note={`${(e.last7 / 7).toFixed(1)} a day`} />
          <StatTile icon={Gauge} tone="brand" label="Daily Average" value={e.avg14.toFixed(1)} note="over the last 14 days" />
          <StatTile icon={ListTodo} tone="warn" label="Left To Do" value={work.items.length.toLocaleString("en-MY")} note={e.daysToClear != null ? `≈ ${e.daysToClear.toLocaleString("en-MY")} days at this pace` : "no pace yet"} />
        </div>
        {work.guard.high && <div className="rounded-2xl border border-warn/50 bg-warn-soft px-4 py-3 text-[13.5px] text-ink" data-testid="guard-banner"><b>Chase idle samples first.</b> {(work.guard.notPosted + work.guard.noSale).toLocaleString("en-MY")} samples already sent have not turned into sales, so new creators are held back ({queue.held.length.toLocaleString("en-MY")} waiting).</div>}
        <Card>
          <nav aria-label="Kind" className="flex flex-wrap gap-2 border-b border-line px-5 py-3" data-testid="kind-chips">
            {[{ key: "", label: "All", n: work.items.length, icon: ListTodo }, ...(["creator", "task", "video"] as const).map((k) => ({ key: k as string, label: KIND_LABEL[k], n: counts[k], icon: KIND_ICON[k] }))].map((c) => (
              <Link key={c.key || "all"} href={href("/affiliate/actions", { kind: c.key || undefined })} scroll={false} aria-current={c.key === kind ? "page" : undefined} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium", c.key === kind ? "border-brand/40 bg-brand-soft text-brand" : "border-line text-ink-2 hover:bg-surface-2")}><c.icon className="size-3.5" />{c.label}<span className="tnum text-[12px] text-ink-3">{c.n.toLocaleString("en-MY")}</span></Link>
            ))}
          </nav>
          {slice.length === 0 ? <div className="px-5 py-12 text-center text-[14px] text-ink-3"><Check className="mx-auto mb-2 size-5 text-good" />Nothing left to do right now.</div> : (
            <ul data-testid="work-rows">{slice.map((w) => w.kind === "creator" ? <Row key={w.key} i={w.item} period={period} /> : w.kind === "task" ? <TaskRow key={w.key} w={w} /> : <VideoWorkRow key={w.key} w={w} />)}</ul>
          )}
          <Pagination page={pg.page} pages={pages} total={shown.length} pageSize={pg.pageSize} size={size} hrefFor={(p) => qs({ size: size === SIZE ? undefined : size, page: p > 1 ? p : undefined })} sizeHrefFor={(z) => qs({ size: z === SIZE ? undefined : z })} />
        </Card>
      </div>
    );
  }
  if (tab === "plan") {
    const allowed = can(user, "execution");
    let plan = allowed ? await loadPlan() : null;
    if (plan && !plan.tasks.length) { try { await syncPlan(); plan = await loadPlan(); } catch (e) { console.error("Execution plan sync failed", e); } }
    return (
      <div className="space-y-6">
        <PageHeader title="Actions" description="Two views of the same work. By Creator is one next step for each creator. By Product is the plan the system writes from each product's numbers; your team assigns, does and ticks it off." />
        <Tabs tab="plan" today={todayN} creators={queue.todo.length} plan={planCount} />
        {plan ? <ExecutionBoard data={plan} me={user.id} meName={user.name} canManage canWork openFirst={one(sp.task)} /> : <Card><EmptyState icon={<Users className="size-5" />} title="Product actions are locked for your role" description="Ask an owner to allow Actions: By Product for your role." /></Card>}
      </div>
    );
  }
  const view = (VIEWS.find((v) => v.key === one(sp.view))?.key ?? "todo") as (typeof VIEWS)[number]["key"];
  const lever = (["creators", "content", "quality"].includes(one(sp.lever) ?? "") ? one(sp.lever) : "") as Lever | "";
  const prod = one(sp.product) ?? "";
  const base = queue[view].filter((i) => (!lever || i.lever === lever) && (!prod || i.pid === prod));
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const size = sizeFrom(sp, SIZE);
  const pg = pageOf(base, page, size);
  const pages = pg.pages, rows = pg.rows;
  const today = todayKL();
  const doneToday = queue.waiting.filter((i) => i.doneOn === today).length;
  const upside = queue.todo.reduce((n, i) => n + i.expected, 0);
  const count = (l: Lever) => queue[view].filter((i) => i.lever === l).length;
  const q = (extra: Record<string, string | number | undefined>) => href("/affiliate/actions", { view: view === "todo" ? undefined : view, lever: lever || undefined, product: prod || undefined, ...extra });
  const period = `Last 28 days to ${fmtDayLabel(data.ref)}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Actions" description="Two views of the same work. By Creator is one next step for each creator, biggest possible sales first; creators you have contacted wait 14 days while we see whether it worked. Click the action for a ready message." />
      <Tabs tab="creators" today={todayN} creators={queue.todo.length} plan={planCount} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="action-kpis">
        <StatTile icon={ListTodo} tone="brand" label="To Do" value={queue.todo.length.toLocaleString("en-MY")} note={`ready to work${queue.held.length ? ` · +${queue.held.length.toLocaleString("en-MY")} held` : ""}`} />
        <StatTile icon={CheckCircle2} tone="good" label="Done Today" value={String(doneToday)} note="contacted today" />
        <StatTile icon={Hourglass} tone="neutral" label="Waiting For Result" value={queue.waiting.length.toLocaleString("en-MY")} note={`contacted in the last ${WAIT_DAYS} days`} />
        <StatTile icon={Wallet} tone="good" label="Possible Sales" value={upside > 0 ? `≈ RM ${fmtCompact(upside)}` : "–"} note="estimate, if the list works" />
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
        <Pagination page={pg.page} pages={pages} total={base.length} pageSize={pg.pageSize} size={size} hrefFor={(p) => q({ size: size === SIZE ? undefined : size, page: p > 1 ? p : undefined })} sizeHrefFor={(z) => q({ size: z === SIZE ? undefined : z })} />
      </Card>
    </div>
  );
}
