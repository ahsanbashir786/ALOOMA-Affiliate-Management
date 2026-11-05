import type { Metadata } from "next";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { one, type SP } from "@/lib/url";
import { gate } from "@/lib/gate";

export const metadata: Metadata = { title: "Permission Denied" };

/** Where actions send someone whose role does not allow what they tried. */
export default async function DeniedPage({ searchParams }: { searchParams: Promise<SP> }) {
  const need = one((await searchParams).need) as PermissionKey | undefined;
  const perm = PERMISSIONS.find((p) => p.key === need);
  const { denied } = await gate(perm?.key ?? "users.manage", perm?.group ?? "this");
  return denied ?? <p className="py-20 text-center text-ink-2">Your role allows this.</p>;
}
