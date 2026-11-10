import { redirect } from "next/navigation";

/** Users and roles now live in Settings → User Management. This address is kept so old links and bookmarks still work. */
export default function UsersPage() {
  redirect("/settings?tab=users");
}
