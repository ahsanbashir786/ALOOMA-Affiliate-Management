import "server-only";
import { readFile } from "node:fs/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";
import os from "node:os";
import { cpuBusyPct } from "@/lib/storage/server";

export type Sample = { at: number; cpu: number | null; lagMs: number };
type G = typeof globalThis & { __samples?: Sample[]; __lastStat?: string; __loop?: ReturnType<typeof monitorEventLoopDelay> };
const g = globalThis as G;

/** One reading of how busy the processor is and how long the app was held up. Kept in memory (the last 20 readings), taken every 2 minutes. */
export async function sampleServer(): Promise<Sample> {
  if (!g.__loop) { g.__loop = monitorEventLoopDelay({ resolution: 20 }); g.__loop.enable(); }
  let cpu: number | null = null;
  try {
    const now = await readFile("/proc/stat", "utf8");
    if (g.__lastStat) cpu = cpuBusyPct(g.__lastStat, now);
    g.__lastStat = now;
  } catch { /* not Linux */ }
  const lag = g.__loop.max / 1e6; // the longest hold-up since the last reading, in ms
  g.__loop.reset();
  const s: Sample = { at: Date.now(), cpu, lagMs: Number.isFinite(lag) ? lag : 0 };
  g.__samples = [...(g.__samples ?? []), s].slice(-20);
  return s;
}

export const readSamples = (): Sample[] => g.__samples ?? [];
export const load5PerCore = (): number => os.loadavg()[1] / (os.cpus().length || 1);
