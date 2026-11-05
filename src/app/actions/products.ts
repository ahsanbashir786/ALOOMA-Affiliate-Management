"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { isMappable } from "@/lib/products/catalog";

type R = { ok?: true; error?: string };
const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];
const Id = z.string().trim().regex(/^\d{5,30}$/);
const Key = z.string().refine(isMappable, "Choose one of the 13 products, or Excluded.");
const done = () => { revalidatePath("/product-mapping"); revalidatePath("/creators", "layout"); };

/** Which of the 13 products a TikTok listing is (or "excluded"). Saving it also confirms it. Every change is logged and can be undone. */
export async function setListingProduct(productId: string, key: string): Promise<R> {
  const user = await requireUser("manager");
  const p = z.object({ id: Id, key: Key }).safeParse({ id: productId, key });
  if (!p.success) return { error: p.error.issues[0].message };
  const [prev] = await q(sql`select product_key, confirmed from product_map where product_id = ${p.data.id}`);
  await q(sql`insert into product_map (product_id, product_key, confirmed, updated_by) values (${p.data.id}, ${p.data.key}, true, ${user.id})
    on conflict (product_id) do update set product_key = excluded.product_key, confirmed = true, updated_at = now(), updated_by = excluded.updated_by`);
  await q(sql`insert into product_map_log (user_id, kind, ref, from_key, from_confirmed, to_key) values (${user.id}, 'listing', ${p.data.id}, ${(prev?.product_key as string) ?? null}, ${(prev?.confirmed as boolean) ?? null}, ${p.data.key})`);
  done();
  return { ok: true };
}

/** The owner agrees with the suggested product of listings (all of them, or one). */
export async function confirmSuggested(productId?: string): Promise<R & { count?: number }> {
  const user = await requireUser("manager");
  const id = productId ? Id.safeParse(productId) : null;
  if (id && !id.success) return { error: "Choose a listing." };
  const rows = await q(id
    ? sql`select product_id, product_key from product_map where confirmed = false and product_id = ${id.data}`
    : sql`select product_id, product_key from product_map where confirmed = false`);
  for (const r of rows) {
    await q(sql`update product_map set confirmed = true, updated_at = now(), updated_by = ${user.id} where product_id = ${r.product_id as string}`);
    await q(sql`insert into product_map_log (user_id, kind, ref, from_key, from_confirmed, to_key) values (${user.id}, 'listing', ${r.product_id as string}, ${r.product_key as string}, false, ${r.product_key as string})`);
  }
  done();
  return { ok: true, count: rows.length };
}

/** One SKU is really another product than its listing (an add-on). null = it follows its listing again. */
export async function setSkuProduct(skuId: string, productId: string, key: string | null): Promise<R> {
  const user = await requireUser("manager");
  const p = z.object({ sku: Id, pid: Id, key: Key.nullable() }).safeParse({ sku: skuId, pid: productId, key });
  if (!p.success) return { error: p.error.issues[0].message };
  const [prev] = await q(sql`select product_key from sku_map where sku_id = ${p.data.sku}`);
  if (p.data.key === null) await q(sql`delete from sku_map where sku_id = ${p.data.sku}`);
  else await q(sql`insert into sku_map (sku_id, product_id, product_key, updated_by) values (${p.data.sku}, ${p.data.pid}, ${p.data.key}, ${user.id})
    on conflict (sku_id) do update set product_key = excluded.product_key, product_id = excluded.product_id, updated_at = now(), updated_by = excluded.updated_by`);
  await q(sql`insert into product_map_log (user_id, kind, ref, from_key, to_key) values (${user.id}, 'sku', ${p.data.sku}, ${(prev?.product_key as string) ?? null}, ${p.data.key})`);
  done();
  return { ok: true };
}

/** Puts one logged change back as it was. */
export async function undoMapChange(logId: number): Promise<R> {
  const user = await requireUser("manager");
  const [l] = await q(sql`select id, kind, ref, from_key, from_confirmed, undone_at from product_map_log where id = ${logId}`);
  if (!l) return { error: "That change no longer exists." };
  if (l.undone_at) return { error: "Already undone." };
  const ref = l.ref as string, from = l.from_key as string | null;
  if (l.kind === "listing") {
    if (from === null) await q(sql`delete from product_map where product_id = ${ref}`);
    else await q(sql`insert into product_map (product_id, product_key, confirmed, updated_by) values (${ref}, ${from}, ${(l.from_confirmed as boolean) ?? false}, ${user.id})
      on conflict (product_id) do update set product_key = excluded.product_key, confirmed = excluded.confirmed, updated_at = now(), updated_by = excluded.updated_by`);
  } else if (from === null) await q(sql`delete from sku_map where sku_id = ${ref}`);
  else await q(sql`insert into sku_map (sku_id, product_key, updated_by) values (${ref}, ${from}, ${user.id}) on conflict (sku_id) do update set product_key = excluded.product_key, updated_at = now(), updated_by = excluded.updated_by`);
  await q(sql`update product_map_log set undone_at = now() where id = ${logId}`);
  done();
  return { ok: true };
}
