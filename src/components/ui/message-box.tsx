"use client";

import { useSyncExternalStore } from "react";
import { MessageCircle } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { waLink, type MsgLang } from "@/lib/samples/states";
import { cn } from "@/lib/utils";

// The chosen message language is remembered in the browser and shared by every message on the page.
const KEY = "msgLang";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("msglang", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("msglang", cb);
  };
};
const read = (): MsgLang => {
  try {
    return localStorage.getItem(KEY) === "ms" ? "ms" : "en";
  } catch {
    return "en";
  }
};
function useMsgLang(): [MsgLang, (l: MsgLang) => void] {
  const lang = useSyncExternalStore(subscribe, read, () => "en" as MsgLang);
  const set = (l: MsgLang) => {
    try {
      localStorage.setItem(KEY, l);
    } catch {}
    window.dispatchEvent(new Event("msglang"));
  };
  return [lang, set];
}

/** The part of a stored message before the "WhatsApp: number" footer. */
const body = (t: string) => t.split("\n\nWhatsApp:")[0];

/** English | Bahasa Melayu switch for messages. */
export function LangToggle({ lang, onChange, className }: { lang: MsgLang; onChange: (l: MsgLang) => void; className?: string }) {
  return (
    <div role="group" aria-label="Message language" className={cn("inline-flex overflow-hidden rounded-lg border border-line-strong bg-surface text-[12.5px] font-medium", className)}>
      {(["en", "ms"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => onChange(l)}
          title={l === "en" ? "English" : "Bahasa Melayu"}
          className={cn("px-2.5 py-1", lang === l ? "bg-brand text-white" : "text-ink-2 hover:bg-surface-2")}
        >
          {l === "en" ? "EN" : "BM"}
        </button>
      ))}
    </div>
  );
}

/** A suggested message with an EN/BM switch, a copy button and (when the number is known) a WhatsApp button. */
export function MessageBox({
  en,
  ms,
  phone,
  extra,
  className,
}: {
  en: string;
  ms?: string | null;
  phone?: string | null;
  extra?: React.ReactNode;
  className?: string;
}) {
  const [lang, setLang] = useMsgLang();
  const shown = lang === "ms" && ms ? ms : en;
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[12px] font-medium tracking-wide text-ink-3 uppercase">Message to send</p>
        {ms && <LangToggle lang={lang} onChange={setLang} />}
      </div>
      <pre className="max-w-3xl font-sans text-[14px] leading-relaxed whitespace-pre-wrap text-ink">{shown}</pre>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyButton text={body(shown)} />
        {phone && (
          <a
            href={waLink(phone, body(shown))}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-2"
          >
            <MessageCircle className="size-4 text-good" /> WhatsApp {phone}
          </a>
        )}
        {extra}
      </div>
    </div>
  );
}

/** Compact "WhatsApp this message" button with its own EN/BM switch (used on the sample tracker cards). */
export function WaSendButton({ phone, en, ms }: { phone: string; en: string; ms: string }) {
  const [lang, setLang] = useMsgLang();
  return (
    <span className="inline-flex items-center gap-2">
      <LangToggle lang={lang} onChange={setLang} />
      <a
        href={waLink(phone, lang === "ms" ? ms : en)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-good px-3 text-[13px] font-medium text-white hover:opacity-90"
      >
        <MessageCircle className="size-4" /> WhatsApp this message
      </a>
    </span>
  );
}
