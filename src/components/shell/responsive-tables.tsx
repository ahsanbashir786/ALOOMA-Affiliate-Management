"use client";

import { useEffect } from "react";

/**
 * Every table in the app turns into a stack of small cards on a phone: each row becomes a card and each cell shows its column name.
 * The column names are copied from the table's header row, so no table needs to be changed one by one.
 * (A table can opt out with data-stack="off".)
 */
export function ResponsiveTables() {
  useEffect(() => {
    const label = (t: HTMLTableElement) => {
      if (t.dataset.stack === "off") return;
      const heads = Array.from(t.querySelectorAll("thead tr:last-child > th")).map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim());
      if (!heads.length) return;
      t.querySelectorAll("tbody tr").forEach((tr) => {
        let col = 0;
        Array.from(tr.children).forEach((c) => {
          const cell = c as HTMLElement;
          if (cell.tagName !== "TD" && cell.tagName !== "TH") return;
          const span = Number((cell as HTMLTableCellElement).colSpan) || 1;
          const name = span > 1 ? "" : heads[col] ?? "";
          if (cell.dataset.label !== name) { if (name) cell.dataset.label = name; else delete cell.dataset.label; }
          col += span;
        });
      });
    };
    const all = () => document.querySelectorAll("main table").forEach((t) => label(t as HTMLTableElement));
    all();
    let queued = false;
    const mo = new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; all(); }); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return null;
}
