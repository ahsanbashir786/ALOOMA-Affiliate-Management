"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn, fmtRM, fmtRMCompact } from "@/lib/utils";

export type Series = { key: string; label: string; color: string };
export type Row = { bucket: string } & Record<string, number | string | undefined>;

const fmtTick = (s: string) => {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

function TooltipBox({
  active,
  payload,
  label,
  series,
  weekly,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
  series: Series[];
  weekly: boolean;
}) {
  if (!active || !payload?.length || !label) return null;
  const rows = series
    .map((s) => ({ s, v: Number(payload.find((p) => p.dataKey === s.key)?.value ?? 0) }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v);
  const total = rows.reduce((a, r) => a + r.v, 0);
  return (
    <div className="min-w-[200px] rounded-lg border border-line bg-surface px-3 py-2.5 shadow-pop">
      <p className="mb-1.5 text-[12px] font-medium text-ink-3">
        {weekly ? "Week of " : ""}
        {fmtTick(label)}
      </p>
      <ul className="space-y-1">
        {rows.map(({ s, v }) => (
          <li key={s.key} className="flex items-center justify-between gap-4 text-[13px]">
            <span className="flex items-center gap-2 text-ink-2">
              <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="tnum font-medium text-ink">{fmtRM(v)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-between border-t border-line pt-1.5 text-[13px]">
        <span className="text-ink-2">Total</span>
        <span className="tnum font-semibold text-ink">{fmtRM(total)}</span>
      </div>
    </div>
  );
}

/** Stacked columns over time. Legend entries toggle series on/off. */
export function TrendChart({
  data,
  series,
  weekly = false,
  height = 300,
}: {
  data: Row[];
  series: Series[];
  weekly?: boolean;
  height?: number;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = useMemo(() => series.filter((s) => !hidden.has(s.key)), [series, hidden]);
  const present = useMemo(
    () => series.filter((s) => data.some((d) => Number(d[s.key] ?? 0) > 0)),
    [series, data],
  );
  const every = data.length > 20 ? Math.ceil(data.length / 10) : 1;

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Series">
        {present.map((s) => {
          const off = hidden.has(s.key);
          return (
            <li key={s.key}>
              <button
                onClick={() =>
                  setHidden((h) => {
                    const n = new Set(h);
                    if (n.has(s.key)) n.delete(s.key);
                    else n.add(s.key);
                    return n;
                  })
                }
                aria-pressed={!off}
                className={cn(
                  "flex items-center gap-2 rounded-md px-1.5 py-0.5 text-[13px] transition-opacity hover:bg-surface-2",
                  off ? "text-ink-3 line-through opacity-60" : "text-ink-2",
                )}
              >
                <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
                {s.label}
              </button>
            </li>
          );
        })}
      </ul>
      <div style={{ height }} role="img" aria-label="Sales over time by source">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="bucket"
              tickFormatter={fmtTick}
              interval={every - 1}
              tick={{ fill: "var(--ink-3)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              tickFormatter={(v) => fmtRMCompact(Number(v)).replace("RM ", "")}
              tick={{ fill: "var(--ink-3)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={<TooltipBox series={series} weekly={weekly} />}
              isAnimationActive={false}
            />
            {visible.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="a"
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
