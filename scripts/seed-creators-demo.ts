export {};
// Fills the TikTok sync tables of a *_test database with a year of realistic demo data (about 300 creators), for building and
// checking the Creators screens. Deterministic. Refuses to touch any database that is not named *_test.
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }

let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;

const PRODUCTS = [
  { id: "1729001", title: "ALOOMA Waterproof Mattress Protector Fitted Sheet Anti-Dust Mite", price: 59, skus: ["MP-Q-WP", "MP-K-WP", "MP-S-WP"] },
  { id: "1729002", title: "ALOOMA Non-Waterproof Mattress Protector Breathable Cotton", price: 45, skus: ["MP-Q-NWP", "MP-K-NWP"] },
  { id: "1729003", title: "ALOOMA Pillow Protector Zipper Waterproof 2pcs", price: 29, skus: ["PP-2"] },
  { id: "1729004", title: "ALOOMA Fitted Bedsheet Set Non-Waterproof Queen", price: 79, skus: ["BS-Q-SET", "BS-K-SET"] },
  { id: "1729005", title: "ALOOMA Waterproof Bedsheet Single Item", price: 55, skus: ["BS-Q-WP"] },
  { id: "1729006", title: "ALOOMA Selimut Soft Blanket Microfibre", price: 69, skus: ["SL-Q"] },
  { id: "1729007", title: "ALOOMA Coral Fleece Towel Quick Dry", price: 19, skus: ["TW-CF"] },
  { id: "1729008", title: "ALOOMA Exclusive Mattress Protector Waterproof (Exclusive)", price: 65, skus: ["MP-Q-EX"] },
];
const A = ["aina", "nur", "siti", "farah", "hana", "iman", "izzah", "liyana", "mira", "nabila", "qistina", "sofea", "wani", "zara", "amir", "danish", "hakim", "irfan", "khai", "luqman"];
const B = ["homeliving", "bedroom", "cozy", "review", "finds", "mylife", "picks", "daily", "deals", "haul", "diaries", "corner", "story", "cleanhome", "tidy"];
const names = new Set<string>();
while (names.size < 320) names.add(`${pick(A)}.${pick(B)}${chance(0.5) ? Math.floor(rnd() * 99) : ""}`);
const creators = [...names].map((u, i) => ({
  u, followers: Math.round(Math.exp(6.5 + rnd() * 6.2)), quality: rnd() ** 1.6, // 0..1, skewed low
  kind: chance(0.15) ? "LIVE" : chance(0.25) ? "BOTH" : "VIDEO",
  start: Math.floor(rnd() * 300), // day offset of when they began, from 330 days ago
  fade: chance(0.25) ? 60 + Math.floor(rnd() * 200) : 9999, // some stop selling
  sample: chance(0.6), i,
}));

async function main() {
  const { db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const q = (s: ReturnType<typeof sql>) => db.execute(s);
  for (const t of ["tt_affiliate_order_lines", "tt_videos", "tt_lives", "tt_sample_requests", "tt_orders", "tt_skus", "tt_cancellations", "tt_returns"]) await q(sql.raw(`delete from ${t}`));
  const DAY = 86400000, now = Date.now();
  const iso = (daysAgo: number, hour = 12) => new Date(now - daysAgo * DAY + (hour - 12) * 3600000).toISOString();

  for (const p of PRODUCTS) for (const s of p.skus) await q(sql`insert into tt_skus (sku_id, product_id, product_title, seller_sku, price, currency, stock, product_status) values (${"SKU-" + s}, ${p.id}, ${p.title}, ${s}, ${p.price}, 'MYR', ${Math.floor(rnd() * 400)}, 'ACTIVATE')`);

  const lines: unknown[][] = [], vids: unknown[][] = [], lives: unknown[][] = [], reqs: unknown[][] = [], ords: unknown[][] = [];
  let oid = 5000000, vid = 1;
  for (const c of creators) {
    const mine = [...PRODUCTS].sort(() => rnd() - 0.5).slice(0, 1 + Math.floor(rnd() * 3));
    const first = 330 - c.start; // days ago when active
    const last = c.fade < 9000 ? Math.max(0, first - c.fade) : 0;
    // sample requests + orders
    for (const p of mine) {
      if (!c.sample && chance(0.7)) continue;
      const askedAgo = Math.min(first, Math.floor(rnd() * 330));
      const sku = pick(p.skus);
      const id = `SR${reqs.length + 1}`;
      const status = askedAgo < 3 && chance(0.5) ? "PENDING" : "APPROVED";
      const orderId = status === "APPROVED" ? `SO${oid++}` : null;
      reqs.push([id, status, `U${c.i}`, c.u, c.u.replace(".", " "), c.followers, Math.round(c.followers * (3 + rnd() * 30) * c.quality), Math.round(5 + rnd() * 80), c.followers * 8, Math.round(40 + c.quality * 60), p.id, "SKU-" + sku, p.title, sku, 1500, orderId, status === "PENDING", iso(askedAgo - 3), 3, iso(askedAgo)]);
      if (orderId) {
        const delivered = askedAgo - 5;
        ords.push([orderId, delivered > 1 ? "DELIVERED" : "IN_TRANSIT", true, iso(askedAgo - 1), iso(askedAgo - 1), iso(Math.max(0, delivered)), delivered > 1 ? iso(delivered) : null, 0, "MYR", "TRK" + oid, "J&T", JSON.stringify([{ sku_id: "SKU-" + sku, product_id: p.id, seller_sku: sku }]), delivered > 1]);
      }
      // did they post?
      if (orderId && askedAgo > 7 && chance(0.35 + c.quality * 0.6)) {
        const n = 1 + Math.floor(rnd() * 4 * (0.4 + c.quality));
        for (let k = 0; k < n; k++) vids.push([`V${vid++}`, c.u, `${p.title.slice(0, 40)} #${k + 1}`, iso(Math.max(0, askedAgo - 6 - Math.floor(rnd() * Math.max(1, askedAgo - 6)))), Math.round(c.followers * (0.2 + rnd() * 3)), Math.round(rnd() * 900 * c.quality), 0, 0.03, JSON.stringify([{ id: p.id, name: p.title }])]);
      }
    }
    const sellers = mine.length ? mine : [pick(PRODUCTS)];
    // video / live output
    const nv = c.kind === "LIVE" ? 0 : Math.floor((first - last) / 18 * (0.2 + c.quality) * 2);
    for (let k = 0; k < nv; k++) { const pr = pick(sellers); vids.push([`V${vid++}`, c.u, `${pr.title.slice(0, 40)} review`, iso(last + Math.floor(rnd() * (first - last + 1))), Math.round(c.followers * (0.1 + rnd() * 2)), Math.round(rnd() * 1200 * c.quality), 0, 0.02, JSON.stringify([{ id: pr.id, name: pr.title }])]); }
    const nl = c.kind === "VIDEO" ? 0 : Math.floor((first - last) / 25 * (0.3 + c.quality) * 2);
    for (let k = 0; k < nl; k++) lives.push([`L${lives.length + 1}`, c.u, "LIVE " + (k + 1), iso(last + Math.floor(rnd() * (first - last + 1))), Math.round(rnd() * 3000 * c.quality), Math.round(rnd() * 30), Math.round(c.followers * 0.05)]);
    // sales across days
    for (let d = first; d >= last; d--) {
      const p = rnd() < 0.5 ? 0.04 + c.quality * 0.5 : 0.01 + c.quality * 0.22;
      if (!chance(p)) continue;
      const n = 1 + Math.floor(rnd() * 3 * (0.3 + c.quality));
      for (let k = 0; k < n; k++) {
        const pr = pick(sellers); const sku = pick(pr.skus); const qty = chance(0.85) ? 1 : 2;
        const live = c.kind === "LIVE" ? chance(0.85) : c.kind === "BOTH" ? chance(0.4) : chance(0.05);
        const mine2 = vids.filter((v) => v[1] === c.u);
        const cid = live ? `L-${c.u}` : mine2.length && chance(0.8) ? String(pick(mine2)[0]) : `OLD-${c.u}-${Math.floor(rnd() * 4)}`;
        lines.push([`AO${oid++}`, "SKU-" + sku, iso(d, 9 + Math.floor(rnd() * 14)), c.u, live ? "LIVE" : "VIDEO", pr.id, sku, pr.title, qty, pr.price, 1200, chance(0.04), cid]);
      }
    }
  }
  const ins = async (table: string, cols: string, data: unknown[][]) => {
    for (let i = 0; i < data.length; i += 300) {
      const part = data.slice(i, i + 300);
      const vals = part.map((r) => sql`(${sql.join(r.map((v) => (v === null ? sql`null` : sql`${v}`)), sql`, `)})`);
      await q(sql`insert into ${sql.raw(table)} (${sql.raw(cols)}) values ${sql.join(vals, sql`, `)}`);
    }
  };
  await ins("tt_affiliate_order_lines", "order_id, sku_id, created_at, creator, content_type, product_id, seller_sku, sku_name, quantity, price, commission_rate, fully_return, content_id", lines.map((l) => { const x = l.slice(); return x; }));
  await ins("tt_videos", "video_id, creator, title, posted_at, views, gmv, units_sold, click_through_rate, products", vids);
  await ins("tt_lives", "live_id, creator, title, started_at, gmv, items_sold, viewers", lives);
  await ins("tt_sample_requests", "id, status, creator_id, creator, nickname, followers, creator_gmv, creator_videos, creator_video_views, fulfilment_pct, product_id, sku_id, product_title, sku_name, commission_rate, order_id, is_approvable, expires_at, available_quantity, first_seen_at", reqs);
  await ins("tt_orders", "order_id, status, is_sample, created_at, paid_at, updated_at, delivered_at, total_amount, currency, tracking_number, shipping_provider, lines, is_final", ords);
  // Demo sign-ins for the browser tests: owner@, manager@ and viewer@test.local (password Passw0rd!test).
  const bcrypt = (await import("bcryptjs")).default;
  const hash = await bcrypt.hash("Passw0rd!test", 10);
  // Roles are made in the app; the tests need two ordinary ones.
  await q(sql`insert into roles (key, name) values ('manager', 'Affiliate Manager'), ('viewer', 'Viewer') on conflict (key) do nothing`);
  await q(sql`insert into role_permissions (role_id, permission) select r.id, p from roles r, unnest(array['execution','creators','products','sync']) p where r.key = 'manager' on conflict do nothing`);
  await q(sql`insert into role_permissions (role_id, permission) select r.id, p from roles r, unnest(array['execution','creators','products']) p where r.key = 'viewer' on conflict do nothing`);
  for (const [name, email, role] of [["Test Owner", "owner@test.local", "admin"], ["Test Manager", "manager@test.local", "manager"], ["Test Viewer", "viewer@test.local", "viewer"]]) {
    await q(sql`insert into users (name, email, password_hash, role_id, active) values (${name}, ${email}, ${hash}, (select id from roles where key = ${role}), true) on conflict (email) do nothing`);
  }
  console.log(`creators ${creators.length} · order lines ${lines.length} · videos ${vids.length} · lives ${lives.length} · sample requests ${reqs.length} · sample orders ${ords.length}`);
  process.exit(0);
}
main();
