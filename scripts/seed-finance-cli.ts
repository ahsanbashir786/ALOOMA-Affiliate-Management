// Puts the made-up finance records into the database named by DATABASE_URL (tests and screenshots only), with RM 20 of ad spend a day so the ad spend line has something to show.
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { seedFinance } from "./finance-demo";
(async () => {
  await seedFinance(async (s) => db.execute(s));
  await db.execute(sql`delete from ads_campaign_daily where advertiser_id = 'FINDEMO'`);
  await db.execute(sql`insert into ads_campaign_daily (advertiser_id, campaign_id, day, cost, orders, gross_revenue) select 'FINDEMO', 'FC', current_date - g, 20, 5, 100 from generate_series(0, 39) g`);
  console.log("finance demo rows added");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
