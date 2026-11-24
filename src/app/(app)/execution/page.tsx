import { redirect } from "next/navigation";

// Execution Plan now lives in Actions › By Product. Old links and bookmarks land there.
export default function ExecutionPage() {
  redirect("/affiliate/actions?tab=plan");
}
