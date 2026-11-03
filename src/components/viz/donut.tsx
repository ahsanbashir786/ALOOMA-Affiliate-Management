import Link from "next/link";
import { C, type ToneKey } from "./colors";

export type DonutPart = { label: string; value: number; tone: ToneKey; href?: string };

/** Share-of-total ring with a legend. The centre shows the total; each legend item can link to its records. */
export function Donut({ parts, centre, caption }: { parts: DonutPart[]; centre: string; caption?: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = 48;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 132 132" width="132" height="132" role="img" aria-label={caption ?? "Breakdown"}>
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--line)" strokeWidth="16" />
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => {
          const len = (p.value / total) * circ;
          const el = <circle key={p.label} cx="66" cy="66" r={r} fill="none" stroke={C[p.tone]} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 1.5)} ${circ}`} strokeDashoffset={-acc} transform="rotate(-90 66 66)"><title>{`${p.label}: ${p.value}`}</title></circle>;
          acc += len;
          return el;
        })}
        <text x="66" y="72" textAnchor="middle" className="fill-[var(--ink)]" style={{ font: "600 22px var(--font-sans, system-ui)" }}>{centre}</text>
      </svg>
      <ul className="space-y-1.5 text-[14px]">
        {parts.map((p) => {
          const inner = (<><span className="mr-2 inline-block size-2.5 rounded-sm align-middle" style={{ background: C[p.tone] }} />{p.label} <b className="tnum">{p.value}</b>{total ? <span className="text-ink-3"> · {Math.round((p.value / total) * 100)}%</span> : null}</>);
          return <li key={p.label}>{p.href && p.value > 0 ? <Link href={p.href} className="hover:underline">{inner}</Link> : inner}</li>;
        })}
      </ul>
    </div>
  );
}
