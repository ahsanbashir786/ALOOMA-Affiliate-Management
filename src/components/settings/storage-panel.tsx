import { AlertTriangle, Archive, Cpu, Database, HardDrive, Layers, MemoryStick, Network, Package } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { fmtBytes, getStorage } from "@/lib/storage/usage";
import { getServerStats } from "@/lib/storage/server";

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

/** How big the server disk is and how much of it this software uses. */
export async function StoragePanel() {
  const [s, v] = await Promise.all([getStorage(), getServerStats()]);
  const memPct = pct(v.memory.used, v.memory.total);
  const dur = (sec: number) => { const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600); return d > 0 ? `${d} day${d === 1 ? "" : "s"} ${h} h` : `${h} h ${Math.floor((sec % 3600) / 60)} min`; };
  const usedPct = pct(s.disk.used, s.disk.total);
  const segs = [
    { key: "database", label: "Database (your data)", bytes: s.database.bytes, color: "var(--s1)", icon: Database },
    { key: "backups", label: "Backups", bytes: s.backups.bytes, color: "var(--s3)", icon: Archive },
    ...(s.app.bytes != null ? [{ key: "app", label: "Program files", bytes: s.app.bytes, color: "var(--s4)", icon: Package }] : []),
    { key: "other", label: "Everything else on the server", bytes: s.other, color: "var(--ink-3)", icon: Layers },
    { key: "free", label: "Free", bytes: s.disk.free, color: "var(--line)", icon: HardDrive },
    ...(s.disk.reserved > s.disk.total * 0.005 ? [{ key: "reserved", label: "Reserved by the system", bytes: s.disk.reserved, color: "var(--line-strong)", icon: Layers }] : []),
  ];
  const ours = s.database.bytes + s.backups.bytes + (s.app.bytes ?? 0);
  return (
    <div className="space-y-5" data-testid="storage-panel">
      {usedPct >= 80 && (
        <Card className={`flex items-center gap-2 px-4 py-3 text-[14px] ${usedPct >= 90 ? "bg-critical-soft" : "bg-warn-soft"}`} data-testid="storage-warning">
          <AlertTriangle className={`size-4 ${usedPct >= 90 ? "text-critical" : "text-warn"}`} />
          <span><b>The server disk is {Math.round(usedPct)}% full.</b> {usedPct >= 90 ? "Free some space or upgrade the server soon, or the app and database can stop." : "Plan to free some space or upgrade the server."}</span>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="server-tiles">
        <StatTile icon={MemoryStick} label="Memory (RAM)" value={`${fmtBytes(v.memory.used)} of ${fmtBytes(v.memory.total)}`} note={`${memPct.toFixed(0)}% used · this app ${fmtBytes(v.memory.appRss)}`} tone={memPct >= 90 ? "critical" : memPct >= 80 ? "warn" : "brand"} />
        <StatTile icon={Cpu} label="vCPU" value={`${v.cpu.cores} ${v.cpu.cores === 1 ? "core" : "cores"}`} note={v.cpu.busyPct != null ? `${v.cpu.busyPct.toFixed(0)}% busy now · load ${v.cpu.load[1].toFixed(2)} (5 min)` : `load ${v.cpu.load[1].toFixed(2)} (5 min)`} tone={v.cpu.busyPct != null && v.cpu.busyPct >= 90 ? "warn" : "neutral"} />
        <StatTile icon={Network} label="Data Transfer This Month" value={v.network ? fmtBytes(v.network.tx + v.network.rx) : "Not measured"} note={v.network ? `Sent ${fmtBytes(v.network.tx)} · received ${fmtBytes(v.network.rx)}, as seen by the app` : "Only measured on the server"} tone="neutral" />
        <StatTile icon={Layers} label="Server Running For" value={dur(v.uptimeSec)} note="since the last restart" tone="good" />
      </div>
      {v.network && <p className="-mt-2 text-[12.5px] text-ink-3" data-testid="net-note">Data transfer counts the traffic the app itself sends and receives (syncs, pages, files) since {new Date(v.network.since).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}. Your hosting company&apos;s own meter is the one that counts for the plan limit (2 TB a month); check it in their panel.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={HardDrive} label="Server Disk Total" value={fmtBytes(s.disk.total)} note="The whole disk of your VPS" tone="neutral" />
        <StatTile icon={Layers} label="Used" value={fmtBytes(s.disk.used)} note={`${usedPct.toFixed(1)}% of the disk`} tone={usedPct >= 90 ? "critical" : usedPct >= 80 ? "warn" : "brand"} />
        <StatTile icon={HardDrive} label="Free" value={fmtBytes(s.disk.free)} note={`${(100 - usedPct).toFixed(1)}% left`} tone="good" />
        <StatTile icon={Database} label="This Software Uses" value={fmtBytes(ours)} note={s.app.bytes != null ? "Database, backups and program files" : "Database and backups"} />
      </div>

      <Card>
        <CardHeader title="Where The Disk Space Goes" description="The whole bar is your server's disk." />
        <div className="px-5 pb-5">
          <div className="flex h-5 w-full overflow-hidden rounded-full bg-line" role="img" aria-label="Disk usage" data-testid="storage-bar">
            {segs.map((g) => <div key={g.key} title={`${g.label}: ${fmtBytes(g.bytes)}`} style={{ width: `${pct(g.bytes, s.disk.total)}%`, background: g.color, minWidth: g.bytes > 0 ? 2 : 0 }} />)}
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="storage-legend">
            {segs.map((g) => (
              <li key={g.key} className="flex items-center gap-2.5 text-[14px]">
                <span className="size-3 shrink-0 rounded-sm" style={{ background: g.color }} />
                <span className="text-ink-2">{g.label}</span>
                <span className="tnum ml-auto font-medium text-ink">{fmtBytes(g.bytes)}</span>
              </li>
            ))}
          </ul>
          {s.app.bytes == null && <p className="mt-3 text-[12.5px] text-ink-3">Program files are only counted on the server.</p>}
        </div>
      </Card>

    </div>
  );
}
