// Unit tests for the one-word status/action rules. Run: npx tsx scripts/test-status.ts
import { creatorStatus, winnerThreshold, type StatusInput } from "../src/lib/affiliates/status";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  → ${detail}` : ""}`); };
const base: StatusInput = { paused: false, gmv28: 0, prev28: 0, gmvAll: 0, videos28: 0, winnerGmv: 1000, samples: { sent: 0, waiting: 0, notPosted: 0, posted: 0 } };
const r = (o: Partial<Omit<StatusInput, "samples">> & { samples?: Partial<StatusInput["samples"]> }) => { const x = creatorStatus({ ...base, ...o, samples: { ...base.samples, ...(o.samples ?? {}) } }); return `${x.status}/${x.action}`; };

check("top seller who posts little → Winner / Push", r({ gmv28: 2000, prev28: 1800, videos28: 1 }) === "Winner/Push");
check("top seller who posts well → Winner / Reward", r({ gmv28: 2000, prev28: 1800, videos28: 5 }) === "Winner/Reward");
check("sales down 30%+ with no videos → Slipping / Revive", r({ gmv28: 300, prev28: 800, videos28: 0 }) === "Slipping/Revive");
check("sales down 30%+ but still posting → Slipping / Coach", r({ gmv28: 300, prev28: 800, videos28: 3 }) === "Slipping/Coach");
check("sales up 30%+ with few videos → Rising / Push", r({ gmv28: 500, prev28: 300, videos28: 1 }) === "Rising/Push");
check("sales up 30%+ and posting well → Rising / Keep", r({ gmv28: 500, prev28: 300, videos28: 4 }) === "Rising/Keep");
check("similar sales → Steady / Keep", r({ gmv28: 400, prev28: 380, videos28: 2 }) === "Steady/Keep");
check("sold before, nothing lately → Quiet / Revive", r({ gmvAll: 900 }) === "Quiet/Revive");
check("sample past deadline, nothing posted, no sales → Silent / Chase", r({ samples: { sent: 1, notPosted: 1 } }) === "Silent/Chase");
check("sample past deadline but selling anyway is not Silent", r({ gmv28: 400, prev28: 400, samples: { sent: 1, notPosted: 1 } }) === "Steady/Keep");
check("sample inside the posting window → Waiting / Wait", r({ samples: { sent: 1, waiting: 1 } }) === "Waiting/Wait");
check("posted for a sample but no sales yet → Posted / Coach", r({ samples: { sent: 1, posted: 1 } }) === "Posted/Coach");
check("nothing recorded → New / Approach", r({}) === "New/Approach");
check("paused wins over everything → Paused / Resume", r({ paused: true, gmv28: 5000, videos28: 9 }) === "Paused/Resume");
check("exactly the winner level counts as Winner", r({ gmv28: 1000, videos28: 3 }) === "Winner/Reward");
check("a prior of zero is never 'Slipping' or a fake 'Rising' base", r({ gmv28: 100, prev28: 0, videos28: 0 }) === "Rising/Push");
check("winner threshold is a high percentile of sellers only", winnerThreshold([0, 0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000], 0.9) === 1000 && winnerThreshold([0, 0]) === Infinity);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
