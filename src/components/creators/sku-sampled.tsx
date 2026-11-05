import { fmtFullDay } from "@/lib/time";
import type { DirLine } from "@/lib/workflow/directory";

/**
 * The SKUs that were sent to her as samples for this product, each with the date it was given (delivered; "shipped" when not delivered yet).
 * The same SKU sent twice shows ×2 with both dates. A product she only sells, with no sample, shows a dash.
 */
export function SkuSampled({ l }: { l: DirLine }) {
  const list = l.sampleSkus ?? [];
  if (!list.length) return <span className="text-ink-3">–</span>;
  return (
    <div className="space-y-1.5" data-testid="sku-sampled">
      {list.map((s) => (
        <div key={s.sku}>
          <p className="text-[13px] leading-snug font-medium break-words text-ink" title={s.sku}>{s.sku}{s.times.length > 1 && <span className="ml-1 font-normal text-ink-3">×{s.times.length}</span>}</p>
          <p className="text-[11.5px] leading-snug text-ink-3">{s.times.map((t) => `${t.delivered ? "given" : "shipped"} ${fmtFullDay(t.on)}`).join(" · ")}</p>
        </div>
      ))}
    </div>
  );
}
