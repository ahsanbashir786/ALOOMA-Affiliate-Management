import { can, getCurrentUser } from "@/lib/auth";
import { templateWorkbook } from "@/lib/stock/neworder";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (!can(user, "stock")) return new Response("Your role cannot open this", { status: 403 });
  return new Response((await templateWorkbook()) as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="new-stock-in-order-template.xlsx"' } });
}
