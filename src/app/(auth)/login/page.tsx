import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { login } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  if (n === 0) redirect("/setup");
  return (
    <>
      <h1 className="text-[26px] font-semibold tracking-tight text-ink">Welcome back</h1>
      <p className="mt-1.5 mb-7 text-[14px] text-ink-2">Sign in to your affiliate workspace.</p>
      <AuthForm
        action={login}
        submitLabel="Sign in"
        fields={[
          { name: "email", label: "Email", type: "email", placeholder: "you@company.com", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
      />
    </>
  );
}
