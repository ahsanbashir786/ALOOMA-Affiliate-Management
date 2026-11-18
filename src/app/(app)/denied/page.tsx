import type { Metadata } from "next";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { one, type SP } from "@/lib/url";
import { gate } from "@/lib/gate";
import { firstAllowedScreen, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Permission Denied" };

/** Where actions send someone whose role does not allow what they tried. */
export default async function DeniedPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  if (one(sp.readonly)) {
    const user = await requireUser();
    const home = firstAllowedScreen(user);
    return (
      <div data-testid="read-only-notice" className="mx-auto flex min-h-[50vh] max-w-xl items-center justify-center py-8">
        <div className="w-full rounded-3xl border border-line bg-surface px-8 py-10 text-center shadow-card">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">This Login Is Read-Only</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-2">You can look at everything your login opens, but you cannot change, sync, import or download anything.</p>
          {home && <a href={home} className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong">Back</a>}
        </div>
      </div>
    );
  }
  const need = one(sp.need) as PermissionKey | undefined;
  const perm = PERMISSIONS.find((p) => p.key === need);
  const { denied } = await gate(perm?.key ?? "users", perm?.group ?? "this");
  return denied ?? <p className="py-20 text-center text-ink-2">Your role allows this.</p>;
}
