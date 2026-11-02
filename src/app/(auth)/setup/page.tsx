import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { setupAdmin } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  if (n > 0) redirect("/login");
  return (
    <>
      <h1 className="text-[26px] font-semibold tracking-tight text-ink">Create your workspace</h1>
      <p className="mt-1.5 mb-7 text-[14px] text-ink-2">
        Set up the first admin account. You can invite your team afterwards.
      </p>
      <AuthForm
        action={setupAdmin}
        submitLabel="Create admin account"
        fields={[
          { name: "name", label: "Full name", autoComplete: "name" },
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password (min. 8 characters)", type: "password", autoComplete: "new-password" },
        ]}
      />
    </>
  );
}
