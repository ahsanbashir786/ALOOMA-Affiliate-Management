import { AlertTriangle, Archive, Database, HardDrive, Layers, Package } from "lucide-react";
import { Badge, Card, CardHeader, Td, Th } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { fmtBytes, getStorage } from "@/lib/storage/usage";
import { fmtInt } from "@/lib/utils";

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

/** How big the server disk is and how much of it this software uses. */
export async function StoragePanel() {
  const s = await getStorage();
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

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Biggest Tables In The Database" description={`The database is ${fmtBytes(s.database.bytes)} in total.`} />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" data-testid="storage-tables">
              <thead><tr><Th>Table</Th><Th align="right">Rows</Th><Th align="right">Size</Th></tr></thead>
              <tbody>{s.database.tables.map((t) => <tr key={t.name}><Td className="font-medium">{t.name}</Td><Td align="right">{fmtInt(t.rows)}</Td><Td align="right">{fmtBytes(t.bytes)}</Td></tr>)}</tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Backups" description={s.backups.visible ? `${s.backups.count} backup${s.backups.count === 1 ? "" : "s"} saved, ${fmtBytes(s.backups.bytes)} in total.` : "The backup folder is not visible to the app yet."} />
          {s.backups.visible && s.backups.latest.length > 0 ? (
            <table className="w-full border-collapse" data-testid="storage-backups">
              <thead><tr><Th>Backup</Th><Th>Taken</Th><Th align="right">Size</Th></tr></thead>
              <tbody>{s.backups.latest.map((b) => <tr key={b.name}><Td className="font-medium">{b.name}</Td><Td className="text-ink-2">{new Date(b.at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</Td><Td align="right">{fmtBytes(b.bytes)}</Td></tr>)}</tbody>
            </table>
          ) : (
            <div className="px-5 pb-5 text-[13.5px] text-ink-2" data-testid="storage-no-backups">
              {s.backups.visible ? <p>No backup has been taken yet. <Badge tone="warn">Set up the nightly backup</Badge></p> : <p>Run <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12.5px]">git pull</code> and <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12.5px]">docker compose up -d --build</code> on the server so the app can see the backups folder.</p>}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
