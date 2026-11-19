import { redirect } from "next/navigation";
import { href, one, type SP } from "@/lib/url";

/** Creator Lifecycle was merged into Affiliate Data (its stages are the stage strip there). Old links and bookmarks land on the matching stage. */
export default async function LifecycleMoved({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const stage = one(sp.stage);
  redirect(href("/creators", { stage: stage === "requested" || stage === "way" ? undefined : stage }));
}
