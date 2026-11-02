import { BarChart3, Target, Users } from "lucide-react";
import { Sparkles } from "lucide-react";

const POINTS = [
  { icon: BarChart3, title: "See every source", body: "Video, LIVE, showcase and external traffic in one view." },
  { icon: Users, title: "Know your creators", body: "Spot stars, hidden potential and creators slipping away." },
  { icon: Target, title: "Act on it", body: "Get clear instructions to send each creator, then track results." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[#0f2a4a] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="absolute -top-32 -right-32 size-[520px] rounded-full bg-[#2a78d6]/30 blur-3xl"
        />
        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/15">
            <Sparkles className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Affiliate HQ</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-[34px] leading-tight font-semibold tracking-tight">
            Turn affiliate data into the next best action.
          </h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <p.icon className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-[14px] text-white/70">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[13px] text-white/50">TikTok Shop affiliate management</p>
      </div>
      <div className="flex items-center justify-center bg-app px-6 py-12">
        <div className="w-full max-w-[380px]">{children}</div>
      </div>
    </div>
  );
}
