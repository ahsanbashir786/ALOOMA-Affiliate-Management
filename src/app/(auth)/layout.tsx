import { BarChart3, CheckCircle2, ListChecks, RefreshCw, Sparkles, Users } from "lucide-react";

const WORDS = ["next best action", "follow-up", "sale"];
const POINTS = [
  { icon: BarChart3, text: "See why every product moves" },
  { icon: Users, text: "Know which creators to call today" },
  { icon: ListChecks, text: "Give your team clear work, and track it" },
];

function Hero() {
  return (
    <div className="relative hidden overflow-hidden bg-[#10244b] text-white lg:block">
      {/* soft moving light */}
      <div aria-hidden className="au-orb absolute -top-40 -left-24 size-[560px] rounded-full bg-[#2a78d6]/35 blur-[110px]" />
      <div aria-hidden className="au-orb absolute -right-32 bottom-[-160px] size-[520px] rounded-full bg-[#7b5bd6]/30 blur-[110px]" style={{ animationDelay: "-6s" }} />
      <div aria-hidden className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse at 40% 45%, #000 20%, transparent 72%)" }} />

      <div className="relative flex h-full min-h-screen flex-col justify-between p-12 xl:p-14">
        <div className="au-rise flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/alooma-logo.jpg" alt="ALOOMA" width={150} height={36} className="h-9 w-[150px] rounded-md object-cover" />
        </div>

        <div className="relative">
          {/* floating cards */}
          <div className="relative mx-auto mb-12 h-[290px] w-full max-w-[470px]">
            <div className="au-float-a au-rise absolute top-0 left-0 w-[290px] rounded-2xl border border-white/15 bg-white/[0.09] p-4 shadow-2xl shadow-black/20 backdrop-blur-md" style={{ animationDelay: "0.15s" }}>
              <div className="flex items-center justify-between text-[12px] text-white/70"><span className="flex items-center gap-1.5 font-medium"><Sparkles className="size-3.5 text-[#8fb0ea]" />Next Best Action</span><span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">Sales up</span></div>
              <svg viewBox="0 0 260 74" className="mt-3 h-[74px] w-full" fill="none" aria-hidden>
                <defs><linearGradient id="au-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6aa6ff" stopOpacity="0.35" /><stop offset="1" stopColor="#6aa6ff" stopOpacity="0" /></linearGradient></defs>
                <path d="M0 60 C 30 56, 40 40, 70 44 S 120 62, 150 36 S 205 14, 260 8 V74 H0 Z" fill="url(#au-g)" />
                <path className="au-draw" d="M0 60 C 30 56, 40 40, 70 44 S 120 62, 150 36 S 205 14, 260 8" stroke="#8fb8ff" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="260" cy="8" r="4" fill="#fff" />
              </svg>
              <p className="mt-1 text-[13px] text-white/85">Win back creators who went quiet</p>
            </div>

            <div className="au-float-b au-rise absolute top-[128px] right-0 w-[236px] rounded-2xl border border-white/15 bg-white/[0.09] p-4 shadow-2xl shadow-black/20 backdrop-blur-md" style={{ animationDelay: "0.35s" }}>
              <div className="flex items-center justify-between"><span className="text-[12px] font-medium text-white/70">Creators contacted</span><CheckCircle2 className="size-4 text-emerald-300" /></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className="au-fill h-full rounded-full bg-gradient-to-r from-[#6aa6ff] to-[#b79bff]" style={{ ["--w" as string]: "74%" }} /></div>
              <div className="mt-3 flex items-center -space-x-2">
                {["#2a78d6", "#eb6834", "#1baf7a", "#6250d6", "#e87ba4"].map((c, i) => <span key={c} className="size-7 rounded-full ring-2 ring-[#10244b]" style={{ background: c, opacity: 1 - i * 0.08 }} />)}
                <span className="pl-3 text-[12px] text-white/70">+ your team</span>
              </div>
            </div>

            <div className="au-float-c au-rise absolute bottom-0 left-[10px] flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.09] py-2 pr-4 pl-2.5 shadow-xl shadow-black/20 backdrop-blur-md" style={{ animationDelay: "0.55s" }}>
              <span className="au-live size-2.5 rounded-full bg-emerald-400" />
              <RefreshCw className="size-3.5 text-white/70" />
              <span className="text-[12.5px] font-medium text-white/90">Live from TikTok Shop</span>
            </div>
          </div>

          <h2 className="au-rise max-w-[520px] text-[34px] leading-[1.15] font-semibold tracking-tight xl:text-[38px]" style={{ animationDelay: "0.2s" }}>
            Turn affiliate data into the
            <span className="relative mt-1 block h-[1.25em] w-full overflow-hidden align-bottom">
              {WORDS.map((w, i) => (
                <span key={w} className="au-word absolute left-0 bg-gradient-to-r from-[#8fc2ff] to-[#c7b5ff] bg-clip-text text-transparent" style={{ animationDelay: `${i * 3}s` }}>{w}</span>
              ))}
            </span>
          </h2>
          <ul className="mt-7 space-y-3">
            {POINTS.map((p, i) => (
              <li key={p.text} className="au-rise flex items-center gap-3 text-[14.5px] text-white/80" style={{ animationDelay: `${0.45 + i * 0.12}s` }}>
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10"><p.icon className="size-4 text-[#9dc0ff]" /></span>{p.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="au-rise text-[13px] text-white/45" style={{ animationDelay: "0.9s" }}>TikTok Shop affiliate management</p>
      </div>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <Hero />
      <div className="relative flex items-center justify-center overflow-hidden bg-app px-6 py-12">
        <div aria-hidden className="au-orb pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-[var(--brand)]/10 blur-3xl" />
        <div aria-hidden className="au-orb pointer-events-none absolute -bottom-28 -left-20 size-72 rounded-full bg-[var(--s7)]/10 blur-3xl" style={{ animationDelay: "-5s" }} />
        <div className="au-rise relative w-full max-w-[400px] rounded-3xl border border-line bg-surface/90 p-8 shadow-[0_24px_60px_-24px_rgba(20,30,70,0.25)] backdrop-blur sm:p-9">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/alooma-logo.jpg" alt="ALOOMA" width={118} height={29} className="mb-7 h-[29px] w-[118px] rounded-md object-cover lg:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}
