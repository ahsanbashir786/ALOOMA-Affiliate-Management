// The TikTok calls behind Outreach, against a pretend TikTok (no network). Needs a *_test database.
export {};
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }
process.env.TIKTOK_APP_KEY = "KEY"; process.env.TIKTOK_APP_SECRET = "s3cret"; process.env.TIKTOK_SERVICE_ID = "123";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else fail++; console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail ? " → " + detail.slice(0, 300) : "")); };

async function main() {
  const { connectWithCode, disconnect, tiktokConfig } = await import("../src/lib/tiktok/client");
  const { reviewSampleApplication, searchMarketplace, outreachScopes, reviewEnabled, setReviewEnabled, WRITE_SCOPE, MARKET_SCOPE, preferredCategories, fetchCreatorProfile, saveProfile } = await import("../src/lib/tiktok/outreach");
  const { db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const cfg = tiktokConfig()!;
  await disconnect();
  await db.execute(sql`delete from settings where key = 'tt_category_roots'`);
  const calls: { url: string; body: string | undefined; method: string | undefined }[] = [];
  const now = Math.floor(Date.now() / 1000);
  let mode: "ok" | "agency" | "market" = "ok";
  const fake = async (url: string, init?: RequestInit) => {
    const u = new URL(url); const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (u.pathname.endsWith("/token/get")) return json({ code: 0, data: { access_token: "AT", refresh_token: "RT", access_token_expire_in: now + 86400, refresh_token_expire_in: now + 86400 * 30, seller_name: "ALOOMA", seller_base_region: "MY", granted_scopes: [WRITE_SCOPE, MARKET_SCOPE] } });
    if (u.pathname === "/authorization/202309/shops") return json({ code: 0, data: { shops: [{ id: "S1", name: "ALOOMA MY", region: "MY", cipher: "CIPH" }] } });
    calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined, method: init?.method });
    if (u.pathname.includes("/sample_applications/") && u.pathname.endsWith("/review")) return mode === "agency" ? json({ code: 16022020, message: "seller has no permission to operate agency's sample request" }) : json({ code: 0, data: {}, message: "Success" });
    if (u.pathname === "/product/202309/categories") return json({ code: 0, data: { categories: [
      { id: "600001", parent_id: "0", local_name: "Home Supplies" }, { id: "601450", parent_id: "0", local_name: "Textiles & Soft Furnishings" }, { id: "600024", parent_id: "0", local_name: "Home Improvement" },
      { id: "824328", parent_id: "0", local_name: "Muslim Fashion" }, { id: "600942", parent_id: "0", local_name: "Beauty & Personal Care" }, { id: "601352", parent_id: "0", local_name: "Fashion Accessories" },
      { id: "700000", parent_id: "0", local_name: "Phones & Electronics" }, { id: "851848", parent_id: "600001", local_name: "Bedding" }] } });
    if (/\/marketplace_creators\/(?!search$)[A-Za-z0-9_-]+$/.test(u.pathname)) return json({ code: 0, data: { creator: { username: "tyny", follower_count: 4900, category_ids: ["601450"], pps: "4.2", rating: "4.5", post_rate: "0.7", creator_profile: { creator_level: 3, sample_score: 80, is_official_recommend: false } } } });
    if (u.pathname.endsWith("/marketplace_creators/search")) return json({ code: 0, data: { creators: [{ creator_user_open_id: "OID1", username: "abc", nickname: "ABC", follower_count: 1200, gmv: { amount: "340" }, units_sold: 12 }], next_page_token: "NX" } });
    return json({ code: 1, message: "unknown" });
  };
  await connectWithCode("CODE", cfg, fake as never);
  // the library functions use global fetch unless given one: pass the fake
  const sc = await outreachScopes();
  check("01 the app knows which outreach permissions TikTok granted", sc.connected && sc.write && sc.market);

  const a = await reviewSampleApplication("8070747592760922552", "APPROVE", undefined, fake as never);
  const ac = calls[calls.length - 1];
  check("02 approving posts to the review address of that application with APPROVE and nothing else", a.ok && new URL(ac.url).pathname === "/affiliate_seller/202507/sample_applications/8070747592760922552/review" && ac.method === "POST" && ac.body === '{"review_result":"APPROVE"}', ac.body ?? "");
  check("03 the call is signed and carries the shop cipher", new URL(ac.url).searchParams.get("shop_cipher") === "CIPH" && !!new URL(ac.url).searchParams.get("sign"));
  const r = await reviewSampleApplication("8070747592760922552", "REJECT", "OUT_OF_STOCK", fake as never);
  check("04 rejecting sends the reason TikTok asks for", r.ok && calls[calls.length - 1].body === '{"review_result":"REJECT","reject_reason":"OUT_OF_STOCK"}', calls[calls.length - 1].body ?? "");
  const n = calls.length;
  const noReason = await reviewSampleApplication("8070747592760922552", "REJECT", undefined, fake as never);
  const badId = await reviewSampleApplication("../../etc", "APPROVE", undefined, fake as never);
  check("05 a rejection without a reason, or an odd request number, is refused before anything is sent", !noReason.ok && !badId.ok && calls.length === n);
  mode = "agency";
  const refused = await reviewSampleApplication("8070747592760922552", "APPROVE", undefined, fake as never);
  check("06 when TikTok refuses, its own message comes back and nothing is claimed done", !refused.ok && /agency's sample request/.test(refused.ok ? "" : refused.error), JSON.stringify(refused));

  const m = await searchMarketplace({ keyword: "bedding", gmvRanges: ["GMV_RANGE_100_1000", "bad value"] }, fake as never);
  const mc = calls[calls.length - 1];
  check("07 creator search posts the keyword and only valid sales ranges, 20 at a time", m.ok && new URL(mc.url).pathname === "/affiliate_seller/202608/marketplace_creators/search" && new URL(mc.url).searchParams.get("page_size") === "20" && mc.body === '{"keyword":"bedding","gmv_ranges":["GMV_RANGE_100_1000"]}', mc.body ?? "");
  check("08 the answer is read into username, followers, sales and sold", m.ok && m.creators[0].username === "abc" && m.creators[0].followers === 1200 && m.creators[0].gmv === 340 && m.creators[0].units === 12 && m.next === "NX");

  const prefs = await preferredCategories(fake as never);
  const catCall = calls.find((c) => new URL(c.url).pathname === "/product/202309/categories");
  check("10 your six categories are found in TikTok's list (spelling and & differences ignored)", prefs.ok && prefs.ids.length === 6 && prefs.missing.length === 0 && !!catCall && new URL(catCall.url).searchParams.get("category_version") === "v2", JSON.stringify(prefs.missing));
  const callsBefore = calls.length;
  const again = await preferredCategories(fake as never);
  check("11 the category list is kept for a week: the second ask does not call TikTok", again.ok && calls.length === callsBefore);
  const filtered = await searchMarketplace({ categoryIds: prefs.ids, notInvited90d: true }, fake as never);
  const fc = JSON.parse(calls[calls.length - 1].body ?? "{}");
  check("12 the search asks only for your categories and leaves out creators invited in the last 90 days", filtered.ok && Array.isArray(fc.category) && fc.category.length === 6 && fc.category[0].parent_category_id === "600001" && fc.affiliate_data?.not_invited_l90_days === true, JSON.stringify(fc).slice(0, 200));
  const prof = await fetchCreatorProfile("uACafQAAAABmUU2qon4R0vUYvUVS3QC6CICP2m5A2", fake as never);
  const pc = calls[calls.length - 1];
  check("13 a creator's profile is read from their own address, with level, categories and scores", prof.ok && new URL(pc.url).pathname === "/affiliate_seller/202608/marketplace_creators/uACafQAAAABmUU2qon4R0vUYvUVS3QC6CICP2m5A2" && prof.profile.level === 3 && prof.profile.rating === 4.5 && prof.profile.postRate === 0.7 && prof.profile.categoryIds[0] === "601450");
  const odd = await fetchCreatorProfile("../x", fake as never);
  check("14 an odd creator ID is refused before anything is sent", !odd.ok && !odd.busy);
  if (prof.ok) await saveProfile("TESTOPENID_1234567", prof.profile);
  const [saved] = (await db.execute(sql`select level, category_ids, rating::float8 as rating, has_profile from tt_creator_profiles where open_id = 'TESTOPENID_1234567'`)) as unknown as { level: number; category_ids: string[]; rating: number; has_profile: boolean }[];
  check("15 the profile is kept (level, categories, rating) so it need not be asked again", !!saved && saved.level === 3 && saved.category_ids[0] === "601450" && saved.rating === 4.5 && saved.has_profile === true);
  await db.execute(sql`delete from tt_creator_profiles where open_id = 'TESTOPENID_1234567'`);
  check("09 approving is OFF until the owner switches it on, and the switch holds", (await reviewEnabled()) === false && (await (async () => { await setReviewEnabled(true); const on = await reviewEnabled(); await setReviewEnabled(false); return on && !(await reviewEnabled()); })()));
  await disconnect();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
