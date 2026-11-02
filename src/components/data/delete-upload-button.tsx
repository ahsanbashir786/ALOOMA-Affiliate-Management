"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteUpload } from "@/app/actions/actions";

export function DeleteUploadButton({ id, label }: { id: number; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      aria-label={`Delete ${label}`}
      disabled={pending}
      onClick={() => {
        if (confirm(`Delete "${label}" and the data it added? This can't be undone.`)) start(() => deleteUpload(id));
      }}
      className="rounded-md p-1.5 text-ink-3 hover:bg-critical-soft hover:text-critical disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );
}
