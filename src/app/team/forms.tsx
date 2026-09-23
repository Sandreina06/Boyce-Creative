"use client";

import { useActionState, useState } from "react";
import { addUser, resetPassword, updateUserAccess, type TeamState } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";

type Client = { id: string; name: string };

function Status({ s }: { s: TeamState }) {
  if (s.error) return <p className="text-sm text-critical">{s.error}</p>;
  if (s.ok) return <p className="text-sm text-good">{s.ok}</p>;
  return null;
}

const ROLE_HELP: Record<string, string> = {
  admin: "Sees every client and can manage the team and account mappings.",
  manager: "Sees only the clients ticked below and can edit their settings, budgets and targets.",
  viewer: "Read-only access to the clients ticked below. Good for clients or stakeholders.",
};

function ClientChecks({ clients, selected, disabled }: { clients: Client[]; selected: string[]; disabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {clients.map((c) => (
        <label key={c.id} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="clientIds" value={c.id} defaultChecked={selected.includes(c.id)} disabled={disabled} />
          {c.name}
        </label>
      ))}
    </div>
  );
}

export function AddUserForm({ clients }: { clients: Client[] }) {
  const [state, action, pending] = useActionState(addUser, {});
  const [role, setRole] = useState("viewer");
  return (
    <form action={action} className="space-y-4" key={state.ok}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Temporary password</Label>
          <Input id="password" name="password" type="text" minLength={10} autoComplete="off" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">Role</Label>
          <NativeSelect id="role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="viewer">Viewer (read only)</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </NativeSelect>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
      {role !== "admin" && (
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Clients they can see</legend>
          <ClientChecks clients={clients} selected={[]} disabled={false} />
        </fieldset>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add person"}
        </Button>
        <Status s={state} />
      </div>
    </form>
  );
}

export function EditAccessForm({
  userId,
  role,
  clientIds,
  clients,
  isSelf,
}: {
  userId: string;
  role: string;
  clientIds: string[];
  clients: Client[];
  isSelf: boolean;
}) {
  const [state, action, pending] = useActionState(updateUserAccess, {});
  const [r, setR] = useState(role);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect name="role" value={r} onChange={(e) => setR(e.target.value)} disabled={isSelf} className="h-8">
          <option value="viewer">Viewer</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </NativeSelect>
        {isSelf && <input type="hidden" name="role" value="admin" />}
        {r === "admin" ? (
          <span className="text-xs text-muted-foreground">All clients</span>
        ) : (
          <ClientChecks clients={clients} selected={clientIds} disabled={false} />
        )}
        {!isSelf && (
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Save
          </Button>
        )}
      </div>
      <Status s={state} />
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(resetPassword, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" key={state.ok}>
      <input type="hidden" name="userId" value={userId} />
      <Input name="password" type="text" placeholder="New password" minLength={10} autoComplete="off" className="h-8 w-40" required />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        Set password
      </Button>
      <Status s={state} />
    </form>
  );
}
