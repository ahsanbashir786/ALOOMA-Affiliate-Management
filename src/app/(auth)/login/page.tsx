import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, landingFor } from "@/lib/auth";
import { login } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

// Reads the database on every request, so it must never be prerendered at build time (the Docker build has no database).
export const dynamic = "force-dynamic";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", hour12: false }).format(new Date())) % 24;
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function LoginPage() {
  const me = await getCurrentUser();
  if (me) redirect(landingFor());
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  if (n === 0) redirect("/setup");
  return (
    <>
      <h1 className="au-rise text-[28px] font-semibold tracking-tight text-ink">Welcome back</h1>
      <p className="au-rise mt-1.5 mb-8 text-[14.5px] text-ink-2" style={{ animationDelay: "0.1s" }}>{greeting()}. Sign in to your affiliate workspace.</p>
      <AuthForm
        action={login}
        submitLabel="Sign In"
        fields={[
          { name: "email", label: "Email", type: "email", placeholder: "you@company.com", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
      />
    </>
  );
}
