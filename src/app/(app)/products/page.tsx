import { redirect } from "next/navigation";
import { href, one, type SP } from "@/lib/url";

// Product Analysis is now part of Products. Old links (with their filters) land there.
export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const keep = Object.fromEntries(["tag", "sort", "from", "to"].map((k) => [k, one(sp[k]) || undefined]));
  redirect(href("/affiliate/products", keep));
}
