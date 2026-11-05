// What a TikTok sample request status means to us. Pure (safe anywhere).
//   COMPLETED            the sample was delivered and TikTok's content requirement is done
//   UNFULFILL_CANCELLED  TikTok's "Overdue": the sample WAS shipped and delivered, the creator did not post in TikTok's time.
//                        It is not a cancelled request – whether she posted is decided by OUR evidence (her videos and sales).
//   REJECTED / EXPIRED / CANCELLED  nothing was shipped

/** True when the sample really went out (or was going to). */
export function isShippedStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toUpperCase();
  if (/REJECT|EXPIRE/.test(s)) return false;
  return !/CANCEL/.test(s) || /UNFULFILL/.test(s);
}
/** TikTok itself says the creator missed the deadline. */
export const isOverdueStatus = (status: string | null | undefined) => /UNFULFILL/.test((status ?? "").toUpperCase());

/** The same rule for SQL (alias `r` = tt_sample_requests). */
export const SAMPLE_SHIPPED_SQL = `(coalesce(upper(r.status), '') !~ '(REJECT|EXPIRE)' and (coalesce(upper(r.status), '') !~ 'CANCEL' or upper(r.status) like '%UNFULFILL%'))`;
export const SAMPLE_OVERDUE_SQL = `(coalesce(upper(r.status), '') like '%UNFULFILL%')`;
