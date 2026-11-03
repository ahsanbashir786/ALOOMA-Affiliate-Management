"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { addManualContent, decideContent } from "@/app/actions/workflow";
import { Button, Input } from "@/components/ui/primitives";
import { fmtDateShort } from "@/lib/utils";

type Cand = { contentId: string; kind: string; link: string | null; postedAt: string | null; views: number; reason: string };

/** Quick exception handling: confirm or reject a possible match, or paste a link the reports don't have yet. */
export function ContentReview({ sampleId, username, candidates }: { sampleId: number; username: string; candidates: Cand[] }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const decide = (c: Cand, decision: "verified" | "rejected") =>
    start(async () => {
      const r = await decideContent({ sampleId, contentId: c.contentId, decision, link: c.link ?? undefined }, username);
      setMsg(r.error ?? (decision === "verified" ? "Confirmed – counted as sample content." : "Rejected – will not be suggested again."));
    });
  return (
    <div className="border-t border-dashed border-line bg-surface-2/50 px-5 py-2.5" data-testid={`review-${sampleId}`}>
      {candidates.length > 0 && (
        <ul className="space-y-1.5">
          {candidates.map((c) => (
            <li key={c.contentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span className="font-medium">{c.kind === "live" ? "LIVE" : c.kind === "report" ? "TikTok sample report" : "Video"}</span>
              {c.postedAt && <span className="text-ink-3">{fmtDateShort(c.postedAt)}</span>}
              {c.link && (
                <a href={c.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                  Open <ExternalLink className="size-3" />
                </a>
              )}
              <span className="min-w-0 flex-1 text-ink-2">{c.reason}</span>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide(c, "verified")}><Check className="size-3.5" /> This is it</Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide(c, "rejected")}><X className="size-3.5" /> Not this</Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-2 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addManualContent(username, sampleId, link);
            setMsg(r.error ?? "Link saved and counted.");
            if (!r.error) setLink("");
          });
        }}
      >
        <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a video link to confirm it manually" className="h-8 max-w-sm text-[13px]" aria-label="Video link" />
        <Button size="sm" type="submit" disabled={pending || link.trim().length < 8}>{pending && <Loader2 className="size-3.5 animate-spin" />} Confirm link</Button>
        {msg && <span className="text-[12.5px] text-ink-2">{msg}</span>}
      </form>
    </div>
  );
}
