import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { ClipboardList } from "lucide-react";
import { db } from "@/db";
import { actions, users } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { SEGMENTS, SEGMENT_ORDER } from "@/lib/segments";
import { href, one, type SP } from "@/lib/url";
import { Card, EmptyState, Input, PageHeader, Select, Button } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { ActionRow, type ActionItem } from "@/components/actions/action-row";
import { RegenerateButton } from "@/components/actions/regenerate-button";
import { cn, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Action centre" };

const TABS = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "sent", label: "Sent" },
  { key: "done", label: "Done" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
] as const;
const PAGE_SIZE = 30;

export default async function ActionsPage({ searchParams }: PageProps<"/actions">) {
  const user = await requireUser();
  const sp = (await searchParams) as SP;
  const status = (one(sp.status) ?? "open") as (typeof TABS)[number]["key"];
  const type = one(sp.type) ?? "";
  const mine = one(sp.mine) === "1";
  const q = (one(sp.q) ?? "").trim();
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const conds = [
    status !== "all" ? sql`${actions.status} = ${status}` : sql`true`,
    type ? sql`${actions.type} = ${type}` : sql`true`,
    mine ? sql`${actions.assigneeId} = ${user.id}` : sql`true`,
    q ? sql`${actions.username} ilike ${"%" + q + "%"}` : sql`true`,
  ];
  const where = sql.join(conds, sql` and `);

  const [counts, [{ n: total }], team, [{ latest }]] = await Promise.all([
    db.select({ status: actions.status, n: sql<number>`count(*)::int`, uplift: sql<number>`coalesce(sum(${actions.expectedUplift}),0)::float8` }).from(actions).groupBy(actions.status),
    db.select({ n: sql<number>`count(*)::int` }).from(actions).where(where),
    db.select({ id: users.id, name: users.name }).from(users).where(sql`${users.active} and ${users.role} in ('admin','manager')`).orderBy(asc(users.name)),
    db.select({ latest: sql<string | null>`to_char(max(${actions.periodEnd}), 'YYYY-MM-DD')` }).from(actions),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const rows = await db
    .select({
      id: actions.id, username: actions.username, type: actions.type, priority: actions.priority, title: actions.title,
      reason: actions.reason, instruction: actions.instruction, expectedUplift: actions.expectedUplift,
      baselineGmv: actions.baselineGmv, status: actions.status, assigneeId: actions.assigneeId,
      assigneeName: users.name, note: actions.note, createdAt: actions.createdAt, completedAt: actions.completedAt,
    })
    .from(actions)
    .leftJoin(users, eq(users.id, actions.assigneeId))
    .where(where)
    .orderBy(desc(actions.priority), desc(actions.expectedUplift))
    .limit(PAGE_SIZE)
    .offset((cur - 1) * PAGE_SIZE);

  const countOf = (s: string) => (s === "all" ? counts.reduce((a, c) => a + c.n, 0) : (counts.find((c) => c.status === s)?.n ?? 0));
  const openUplift = counts.find((c) => c.status === "open")?.uplift ?? 0;
  const canEdit = can(user, "manager");
  const base = { status: status === "open" ? undefined : status, type, mine: mine ? "1" : undefined, q };
  const items: ActionItem[] = rows.map((r) => ({ ...r, type: r.type as ActionItem["type"], createdAt: r.createdAt.toISOString(), completedAt: r.completedAt?.toISOString() ?? null }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Action centre"
        description="Recommended outreach for the latest 28 days, ranked by priority. Copy the message, send it on TikTok or WhatsApp, then mark it sent."
        actions={canEdit ? <RegenerateButton /> : undefined}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 pt-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={href("/actions", { ...base, status: t.key === "open" ? undefined : t.key })}
              aria-current={status === t.key ? "page" : undefined}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-[14px] font-medium",
                status === t.key ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink",
              )}
            >
              {t.label}
              <span className="tnum rounded-full bg-surface-2 px-1.5 text-[12px] text-ink-2">{countOf(t.key)}</span>
            </Link>
          ))}
          {openUplift > 0 && (
            <span className="tnum ml-auto pr-2 text-[13px] text-ink-3">
              Open recommendations could add <span className="font-semibold text-good">{fmtRM(openUplift)}</span> (est.)
            </span>
          )}
        </div>
        <form action="/actions" className="flex flex-wrap items-center gap-2.5 border-b border-line p-4">
          {status !== "open" && <input type="hidden" name="status" value={status} />}
          <Input name="q" defaultValue={q} placeholder="Search creator…" className="max-w-[240px]" aria-label="Search" />
          <Select name="type" defaultValue={type} aria-label="Type">
            <option value="">All types</option>
            {SEGMENT_ORDER.filter((k) => k !== "steady").map((k) => (
              <option key={k} value={k}>{SEGMENTS[k].label}</option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
            <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="size-4 accent-[var(--brand)]" /> Assigned to me
          </label>
          <Button type="submit">Filter</Button>
          {latest && <span className="ml-auto text-[12.5px] text-ink-3">Based on data up to {latest}</span>}
        </form>

        {items.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title={countOf("all") === 0 ? "No recommendations yet" : "Nothing here"}
            description={
              countOf("all") === 0
                ? canEdit
                  ? "Generate recommendations from your latest data to start working through them."
                  : "Ask an affiliate manager to generate recommendations."
                : "No actions match these filters."
            }
            action={countOf("all") === 0 && canEdit ? <RegenerateButton /> : undefined}
          />
        ) : (
          <ul>
            {items.map((a) => (
              <ActionRow key={a.id} item={a} team={team} canEdit={canEdit} qs="range=28d" />
            ))}
          </ul>
        )}
        <Pagination page={cur} pages={pages} total={total} pageSize={PAGE_SIZE} hrefFor={(p) => href("/actions", { ...base, page: p })} />
      </Card>
    </div>
  );
}
