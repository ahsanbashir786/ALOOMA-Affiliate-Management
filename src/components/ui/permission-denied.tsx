import Link from "next/link";
import { ArrowRight, KeyRound, Lock, ShieldAlert } from "lucide-react";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";

/** Shown instead of a screen the person's role cannot open. The menu stays complete; only the page is closed. */
export function PermissionDenied({ need, screen, roleName, home, canManageRoles }: {
  need: PermissionKey; screen: string; roleName: string; home: { href: string; label: string } | null; canManageRoles: boolean;
}) {
  const perm = PERMISSIONS.find((p) => p.key === need);
  return (
    <div data-testid="permission-denied" className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center py-8">
      <div className="w-full overflow-hidden rounded-3xl border border-line bg-surface text-center shadow-card">
        <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-b from-critical-soft/70 to-surface">
          {/* soft rings behind the lock */}
          <span aria-hidden className="absolute size-72 rounded-full border border-critical/10" />
          <span aria-hidden className="absolute size-52 rounded-full border border-critical/15" />
          <span aria-hidden className="absolute size-36 rounded-full border border-critical/20 bg-critical-soft/60" />
          <span className="relative flex size-20 items-center justify-center rounded-3xl bg-surface shadow-lg ring-1 ring-critical/20">
            <Lock className="size-9 text-critical" strokeWidth={2.2} />
          </span>
          <ShieldAlert aria-hidden className="absolute top-6 right-[22%] size-5 text-critical/40" />
          <KeyRound aria-hidden className="absolute bottom-7 left-[20%] size-5 -rotate-12 text-critical/35" />
        </div>
        <div className="px-8 pt-2 pb-8">
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">Permission Denied</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-2">
            Your role <b className="font-semibold text-ink">{roleName}</b> cannot open <b className="font-semibold text-ink">{screen}</b>.
          </p>
          <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface-2 px-3.5 py-1.5 text-[13px] text-ink-2">
            <Lock className="size-3.5 text-ink-3" />Needs: <b className="font-semibold text-ink">{perm?.label ?? need}</b>
          </p>
          <p className="mx-auto mt-4 max-w-sm text-[13.5px] text-ink-3">Ask an admin to give your role this permission, then refresh this page.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            {home && <Link href={home.href} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong">Go to {home.label}<ArrowRight className="size-4" /></Link>}
            {canManageRoles && <Link href="/users" className="inline-flex h-10 items-center rounded-lg border border-line-strong bg-surface px-4 text-[14px] font-medium text-ink hover:bg-surface-2">Manage roles</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}
