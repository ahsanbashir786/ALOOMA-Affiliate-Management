import { redirect } from "next/navigation";

// The system opens on the Execution Plan.
export default function Home() {
  redirect("/execution");
}
