"use client";

import { useActionState, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, Lock, MoreHorizontal, Plus, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import { createRole, createUser, deleteRole, renameRole, resetPassword, setRolePermission, updateUser, type Result } from "@/app/actions/users";
import { Person, Popover } from "@/components/execution/ui";
import { Button, Input, Select } from "@/components/ui/primitives";
import { PERMISSIONS, PERMISSION_GROUPS, type PermissionKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type U = { id: string; name: string; email: string; roleId: string; active: boolean };
type R = { id: string; key: string; name: string; isAdmin: boolean; permissions: PermissionKey[]; people: number };

function Feedback({ state }: { state: Result }) {
  if (!state) return null;
  return state.error
    ? <p role="alert" className="flex items-center gap-1.5 text-[13px] text-critical"><AlertCircle className="size-4" />{state.error}</p>
    : <p role="status" className="flex items-center gap-1.5 text-[13px] text-good"><CheckCircle2 className="size-4" />{state.ok}</p>;
}

/* ───────── people ───────── */
function NewUserForm({ roles }: { roles: R[] }) {
  const [state, action, pending] = useActionState(createUser, undefined);
  const def = (roles.find((r) => !r.isAdmin) ?? roles[0])?.id;
  return (
    <form action={action} className="space-y-3" key={state?.ok ?? "form"}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.2fr_0.8fr_1fr_auto] lg:items-end">
        <label className="text-[13px] font-medium text-ink-2">Name<Input name="name" required className="mt-1.5" /></label>
        <label className="text-[13px] font-medium text-ink-2">Email<Input name="email" type="email" required className="mt-1.5" /></label>
        <label className="text-[13px] font-medium text-ink-2">Role<Select name="roleId" defaultValue={def} className="mt-1.5 w-full">{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>
        <label className="text-[13px] font-medium text-ink-2">Temporary password<Input name="password" type="text" required minLength={8} className="mt-1.5" /></label>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Adding…" : "Add User"}</Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

function UserRow({ u, roles, isMe }: { u: U; roles: R[]; isMe: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result>();
  const [pw, pwAction, pwPending] = useActionState(resetPassword, undefined);
  return (
    <li data-testid="user-row" className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4", !u.active && "bg-surface-2/50")}>
      <Person name={u.name} size={38} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">{u.name}{isMe && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] font-semibold text-brand-strong">You</span>}{!u.active && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] text-ink-3">Inactive</span>}</p>
        <p className="truncate text-[13px] text-ink-3">{u.email}</p>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-ink-3">Role
        <Select aria-label={`Role of ${u.name}`} value={u.roleId} disabled={pending} onChange={(e) => start(async () => setMsg(await updateUser(u.id, { roleId: e.target.value })))} className="h-9 text-[14px] text-ink">
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </label>
      <Popover align="right" trigger={<span className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2">Reset Password</span>}>
        <form action={pwAction} className="w-64 space-y-2 p-2">
          <input type="hidden" name="id" value={u.id} />
          <Input name="password" type="text" minLength={8} required placeholder="New temporary password" />
          <Button type="submit" variant="primary" size="sm" disabled={pwPending} className="w-full">Save Password</Button>
          <Feedback state={pw} />
        </form>
      </Popover>
      <Button variant="danger" size="sm" disabled={pending || isMe} title={isMe ? "You can't deactivate yourself" : undefined} onClick={() => start(async () => setMsg(await updateUser(u.id, { active: !u.active })))}>{u.active ? "Deactivate" : "Reactivate"}</Button>
      {msg && <div className="basis-full"><Feedback state={msg} /></div>}
    </li>
  );
}

/* ───────── roles ───────── */
function RoleHeader({ r, roles }: { r: R; roles: R[] }) {
  const [name, setName] = useState(r.name);
  const [msg, setMsg] = useState<Result>();
  const [pending, start] = useTransition();
  const [sure, setSure] = useState(false);
  return (
    <th scope="col" className="min-w-36 px-3 py-3 text-left align-bottom" data-testid="role-head" data-role={r.key}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[14.5px] font-semibold text-ink">{r.isAdmin && <Lock className="size-3.5 text-ink-3" />}<span className="truncate">{r.name}</span></p>
          <p className="mt-0.5 flex items-center gap-1 text-[12px] font-normal text-ink-3"><Users className="size-3" />{r.people} {r.people === 1 ? "person" : "people"}</p>
        </div>
        {!r.isAdmin && (
          <Popover align="right" trigger={<span aria-label={`Edit ${r.name}`} className="inline-flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"><MoreHorizontal className="size-4" /></span>}>
            <div className="w-60 space-y-2 p-2">
              <label className="block text-[12.5px] font-medium text-ink-2">Role name<Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9" /></label>
              <Button size="sm" variant="primary" className="w-full" disabled={pending || name.trim() === r.name} onClick={() => start(async () => setMsg(await renameRole(r.id, name)))}>Rename</Button>
              {!sure
                ? <Button size="sm" variant="danger" className="w-full" onClick={() => setSure(true)}><Trash2 className="size-4" />Delete Role</Button>
                : <div className="rounded-lg bg-critical-soft/60 p-2"><p className="mb-1.5 text-[12.5px] text-critical">Delete {r.name}? This cannot be undone.</p><div className="flex gap-1.5"><Button size="sm" variant="danger" className="flex-1" disabled={pending} onClick={() => start(async () => { setMsg(await deleteRole(r.id)); setSure(false); })}>Delete</Button><Button size="sm" variant="ghost" onClick={() => setSure(false)}>Cancel</Button></div></div>}
              <Feedback state={msg} />
            </div>
          </Popover>
        )}
      </div>
      <span className="sr-only">{roles.length} roles</span>
    </th>
  );
}

function Switch({ on, disabled, label, onChange, testId }: { on: boolean; disabled?: boolean; label: string; onChange: () => void; testId?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} data-testid={testId} disabled={disabled} onClick={onChange}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed", on ? "bg-brand" : "bg-line-strong", disabled && on && "opacity-55")}>
      <span className={cn("inline-block size-4.5 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-[3px]")} />
    </button>
  );
}

function RolesTab({ roles }: { roles: R[] }) {
  const [state, setState] = useState<Record<string, PermissionKey[]>>(() => Object.fromEntries(roles.map((r) => [r.id, r.permissions])));
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [copy, setCopy] = useState("");
  const [pending, start] = useTransition();
  const toggle = (r: R, key: PermissionKey) => {
    const on = !(state[r.id] ?? []).includes(key);
    setErr(null);
    start(async () => {
      const res = await setRolePermission(r.id, key, on);
      if (res?.error) setErr(res.error);
      else if (res?.permissions) setState((s) => ({ ...s, [r.id]: res.permissions! }));
    });
  };
  return (
    <div className="space-y-4" data-testid="roles-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[14px] text-ink-2">Choose which screens each role can open. Everyone still sees the whole menu; a screen their role cannot open shows a Permission Denied page. <b className="font-semibold text-ink">Admin</b> always has everything.</p>
        {!adding && <Button variant="primary" data-testid="new-role" onClick={() => setAdding(true)}><Plus className="size-4" />New Role</Button>}
      </div>
      {adding && (
        <form className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface-2/50 p-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createRole(newName, copy || null); if (r?.error) setErr(r.error); else { setAdding(false); setNewName(""); setCopy(""); } }); }}>
          <label className="text-[13px] font-medium text-ink-2">Role name<Input data-testid="new-role-name" value={newName} onChange={(e) => setNewName(e.target.value)} required minLength={2} className="mt-1.5 w-56" placeholder="e.g. Content Lead" /></label>
          <label className="text-[13px] font-medium text-ink-2">Start from<Select value={copy} onChange={(e) => setCopy(e.target.value)} className="mt-1.5 w-52"><option value="">Nothing ticked</option>{roles.map((r) => <option key={r.id} value={r.id}>Same as {r.name}</option>)}</Select></label>
          <Button type="submit" variant="primary" disabled={pending}>Create Role</Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}><X className="size-4" />Cancel</Button>
        </form>
      )}
      {err && <p role="alert" className="flex items-center gap-1.5 rounded-lg bg-critical-soft px-3.5 py-2.5 text-[13.5px] text-critical"><AlertCircle className="size-4" />{err}</p>}
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-[720px] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-line bg-surface-2/50">
              <th scope="col" className="sticky left-0 z-10 min-w-72 bg-surface-2/90 px-5 py-3 text-left text-[12px] font-semibold tracking-wide text-ink-3 uppercase">Screen{pending && <Loader2 className="ml-2 inline size-3.5 animate-spin" />}</th>
              {roles.map((r) => <RoleHeader key={r.id} r={r} roles={roles} />)}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => (
              <FragmentGroup key={g} group={g} roles={roles} state={state} toggle={toggle} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentGroup({ group, roles, state, toggle }: { group: string; roles: R[]; state: Record<string, PermissionKey[]>; toggle: (r: R, k: PermissionKey) => void }) {
  return (
    <>
      <tr className="bg-surface-2/40"><td colSpan={roles.length + 1} className="sticky left-0 px-5 py-2 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{group}</td></tr>
      {PERMISSIONS.filter((p) => p.group === group).map((p) => (
        <tr key={p.key} className="border-t border-line" data-testid="perm-row" data-perm={p.key}>
          <th scope="row" className="sticky left-0 z-10 bg-surface px-5 py-3 text-left font-normal"><p className="font-medium text-ink">{p.label}</p><p className="mt-0.5 max-w-md text-[12.5px] text-ink-3">{p.help}</p></th>
          {roles.map((r) => {
            const on = r.isAdmin || (state[r.id] ?? []).includes(p.key);
            return <td key={r.id} className="px-3 py-3"><Switch on={on} disabled={r.isAdmin} label={`${r.name}: ${p.label}`} testId={`sw-${r.key}-${p.key}`} onChange={() => toggle(r, p.key)} /></td>;
          })}
        </tr>
      ))}
    </>
  );
}

/* ───────── the screen ───────── */
export function UsersScreen({ users, roles, meId }: { users: U[]; roles: R[]; meId: string }) {
  const [tab, setTab] = useState<"users" | "roles">("users");
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5" role="tablist" aria-label="Users or roles">
        {([["users", "Users", Users, users.length], ["roles", "Roles & Permissions", ShieldCheck, roles.length]] as const).map(([k, l, Icon, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} data-testid={`tab-${k}`} onClick={() => setTab(k)} className={cn("inline-flex h-9 items-center gap-2 rounded-md px-4 text-[14px] font-medium", tab === k ? "bg-brand-soft text-brand-strong" : "text-ink-2 hover:bg-surface-2")}>
            <Icon className="size-4" />{l}<span className="tnum rounded-full bg-surface px-1.5 text-[12.5px] text-ink-3">{n}</span>
          </button>
        ))}
      </div>
      {tab === "users" ? (
        <div className="space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-[16px] font-semibold text-ink"><UserPlus className="size-5 text-ink-3" />Add A Team Member</h2>
            <NewUserForm roles={roles} />
          </section>
          <section className="rounded-2xl border border-line bg-surface shadow-card">
            <ul className="divide-y divide-line">{users.map((u) => <UserRow key={u.id} u={u} roles={roles} isMe={u.id === meId} />)}</ul>
          </section>
        </div>
      ) : <RolesTab roles={roles} />}
    </div>
  );
}
