process.env.SWR_OFF = "1";
// Unit tests for the one-word status/action rules. Run: npx tsx scripts/test-status.ts
import { lineMessage, overviewMessage, type LineStats } from "../src/lib/creators/action-messages";
import { creatorStatus, explainStatus, winnerThreshold, type StatusInput } from "../src/lib/creators/status";

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
check("sample past deadline but selling anyway is not Silent", r({ gmv28: 400, prev28: 400, videos28: 2, samples: { sent: 1, notPosted: 1 } }) === "Steady/Keep");
check("steady but posting little → Push for more videos", r({ gmv28: 400, prev28: 380, videos28: 1 }) === "Steady/Push" && r({ gmv28: 400, prev28: 380, videos28: 0 }) === "Steady/Push");
check("sample inside the posting window → Waiting / Wait", r({ samples: { sent: 1, waiting: 1 } }) === "Waiting/Wait");
check("posted for a sample but no sales yet → Posted / Coach", r({ samples: { sent: 1, posted: 1 } }) === "Posted/Coach");
check("nothing recorded → New / Approach", r({}) === "New/Approach");
check("paused wins over everything → Paused / Resume", r({ paused: true, gmv28: 5000, videos28: 9 }) === "Paused/Resume");
check("exactly the winner level counts as Winner", r({ gmv28: 1000, videos28: 3 }) === "Winner/Reward");
check("a prior of zero is never 'Slipping' or a fake 'Rising' base", r({ gmv28: 100, prev28: 0, videos28: 0 }) === "Rising/Push");
check("winner threshold is a high percentile of sellers only", winnerThreshold([0, 0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000], 0.9) === 1000 && winnerThreshold([0, 0]) === Infinity);
check("explanations quote the numbers used; a rise from nothing never says 'up from RM 0'", explainStatus({ paused: false, gmv28: 100, prev28: 0, gmvAll: 100, videos28: 0, winnerGmv: 9999, samples: { sent: 0, waiting: 0, notPosted: 0, posted: 0 } }, "Rising") === "RM 100 lately, none before · 0 videos lately" && explainStatus({ paused: false, gmv28: 50, prev28: 100, gmvAll: 300, videos28: 1, winnerGmv: 9999, samples: { sent: 0, waiting: 0, notPosted: 0, posted: 0 } }, "Slipping") === "RM 50 lately, down from RM 100 · 1 video lately");
const ls: LineStats = { name: "Bedsheet · Waterproof (Single Item)", orders: 14, gmv: 460, gmvVideo: 460, gmvLive: 0, videos: 4, videos28: 3, lastVideoLabel: "19 Oct", action: "Push", status: "Rising" };
const lm = lineMessage("Push", "amy", ls.name, ls, "1 Sep – 29 Oct")!;
check("line message: orders, GMV by video only (no LIVE when none), videos, last date, then the request", /14 orders, RM 460 \(video RM 460\)/.test(lm.en) && !/LIVE/.test(lm.en) && /4 videos, last on 19 Oct/.test(lm.en) && /post 2 more videos/.test(lm.en) && /Great momentum/.test(lm.en) && /1 Sep – 29 Oct/.test(lm.en) && lm.en.split("\n").length === 4);
const silent = lineMessage("Chase", "amy", "Pillow", { ...ls, name: "Pillow", orders: 3, gmv: 120, gmvVideo: 120, videos: 2, lastVideoLabel: "12 Aug", lastVideoDaysAgo: 90, action: "Chase", status: "Silent" }, "p")!;
check("a message for a silent creator is polite, shows her last video age and numbers, and asks for a video", /Hope you're well/.test(silent.en) && /90 days ago/.test(silent.en) && /3 orders, RM 120/.test(silent.en) && /when do you plan to post/.test(silent.en) && /hari lalu/.test(silent.ms));
const om = overviewMessage("amy", [ls, { ...ls, name: "Pillow", orders: 0, gmv: 0, gmvVideo: 0, videos: 0, action: "Chase", status: "Silent" }], "p")!;
check("all-products message lists each product, a total, and asks from the numbers (more videos for the one that sells, waiting for the unposted)", /Bedsheet[^\n]*14 orders/.test(om.en) && /Pillow: no orders yet, no video yet/.test(om.en) && /Total: 14 orders, RM 460/.test(om.en) && /sells well from only 4 videos/.test(om.en) === false && /Still waiting for your video on Pillow/.test(om.en) && /next level/.test(om.en) && /thank you for being a great partner/.test(om.en) && /let's grow it together/.test(om.en));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
