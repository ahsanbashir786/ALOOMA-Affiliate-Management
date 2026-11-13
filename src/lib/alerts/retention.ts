import "server-only";
import { sql as pg } from "@/db";

export const DEFAULT_RETENTION_DAYS = 14;
const clamp = (n: number) => Math.min(365, Math.max(1, Math.round(n)));

/** How many days an alert is kept after its problem has gone. Set in Settings → System Alerts. */
export async function getRetentionDays(): Promise<number> {
  const [r] = await pg`select value from settings where key = 'alerts_retention_days'`;
  const n = Number((r?.value as { days?: number } | undefined)?.days);
  return Number.isFinite(n) && n >= 1 ? clamp(n) : DEFAULT_RETENTION_DAYS;
}

export async function setRetentionDays(days: number): Promise<number> {
  const d = clamp(days);
  await pg`insert into settings (key, value) values ('alerts_retention_days', ${JSON.stringify({ days: d })}::jsonb) on conflict (key) do update set value = excluded.value`;
  return d;
}
