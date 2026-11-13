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
    // A table wider than its box turns into cards too, so nothing in the app ever scrolls sideways.
    const fit = (t: HTMLTableElement) => {
      if (t.dataset.stack === "off") return;
      t.removeAttribute("data-stacked");
      if (t.offsetParent === null || window.innerWidth < 768) return;
      const box = (t.closest("[class*=overflow-x]") as HTMLElement | null) ?? t.parentElement;
      if (box && t.scrollWidth > box.clientWidth + 1) t.setAttribute("data-stacked", "1");
    };
    const all = () => document.querySelectorAll("main table").forEach((t) => { label(t as HTMLTableElement); fit(t as HTMLTableElement); });
    // Wait until React has finished hydrating (labels added earlier would show as a server/browser mismatch).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = (ms: number) => { clearTimeout(timer); timer = setTimeout(all, ms); };
    const mo = new MutationObserver((list) => { if (list.some((m) => m.type === "childList")) later(250); });
    const onResize = () => later(200);
    window.addEventListener("resize", onResize);
    const start = () => { later(1200); mo.observe(document.body, { childList: true, subtree: true }); };
    if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
    return () => { clearTimeout(timer); mo.disconnect(); window.removeEventListener("resize", onResize); window.removeEventListener("load", start); };
  }, []);
  return null;
}
