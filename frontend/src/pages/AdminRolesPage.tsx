import { useCallback, useEffect, useState } from "react";

import { ApiError, getClusterPrefix } from "../api/client";
import { createServerRole, deleteServerRole, getServerRoles, ServerRole, updateServerRole } from "../api/family";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { BackButton } from "../components/BackButton";

const permissionGroups = [
  {
    name: "Server administration",
    permissions: [
      ["manage_server", "Manage server", "Change server-wide appearance, encryption, public access, and plugin availability"],
      ["manage_roles", "Manage roles", "Create, edit, delete, and assign roles"],
    ],
  },
  {
    name: "Members, spaces & calls",
    permissions: [
      ["manage_members", "Manage members", "Create and revoke server invitations, remove members, assign roles, and add people to any space"],
      ["manage_channels", "Manage spaces", "Create and manage groups, channels, and voice channels. Chat-list folders remain personal"],
      ["manage_calls", "Manage guest links", "Create guest links for group and voice calls, then host and manage guests on links you create"],
    ],
  },
  {
    name: "Content moderation",
    permissions: [
      ["manage_messages", "Manage messages", "Manage pins in spaces configured for administrators only"],
      ["manage_files", "Manage files and storage folders", "Access, edit, share, or delete any server file, folder, or album"],
    ],
  },
  {
    name: "Billing & connections",
    permissions: [
      ["manage_plans", "Manage all plans", "Edit or delete every server plan. Everyone can still manage plans they created"],
      ["manage_integrations", "Manage integrations", "Configure MCP connectors and their access to server data"],
    ],
  },
] as const;

export default function AdminRolesPage() {
  const { accessToken, currentUser } = useAuth();
  const prefix = getClusterPrefix();
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ServerRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canManage = currentUser?.permissions?.includes("manage_roles") || currentUser?.role === "owner";

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const next = await getServerRoles(accessToken);
      setRoles(next);
      setSelectedId((current) => next.some((role) => role.id === current) ? current : next[0]?.id ?? null);
    } catch (err) { setError(err instanceof ApiError ? String(err.message) : "Could not load roles"); }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const selected = roles.find((role) => role.id === selectedId);
    if (selected) setDraft({ ...selected, permissions: [...selected.permissions] });
  }, [roles, selectedId]);

  function select(role: ServerRole) { setSelectedId(role.id); setDraft({ ...role, permissions: [...role.permissions] }); setError(null); }
  function togglePermission(permission: string) {
    setDraft((current) => !current ? current : ({ ...current, permissions: current.permissions.includes(permission) ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission] }));
  }
  function togglePermissionGroup(keys: readonly string[]) {
    setDraft((current) => {
      if (!current) return current;
      const isEnabled = keys.every((key) => current.permissions.includes(key));
      return { ...current, permissions: isEnabled ? current.permissions.filter((item) => !keys.includes(item)) : [...new Set([...current.permissions, ...keys])] };
    });
  }
  async function save() {
    if (!accessToken || !draft) return;
    setSaving(true); setError(null);
    try {
      if (draft.id === "new") await createServerRole(accessToken, draft);
      else await updateServerRole(accessToken, draft.id, { name: draft.name, description: draft.description, permissions: draft.permissions });
      await load();
    } catch (err) { setError(err instanceof ApiError ? String(err.message) : "Could not save role"); } finally { setSaving(false); }
  }
  async function remove() {
    if (!accessToken || !draft || draft.isDefault) return;
    const replacement = roles.find((role) => role.id !== draft.id);
    if (!replacement || !window.confirm(`Delete ${draft.name}? Assigned members will become ${replacement.name}.`)) return;
    setSaving(true); setError(null);
    try { await deleteServerRole(accessToken, draft.id, replacement.id); setSelectedId(null); await load(); }
    catch (err) { setError(err instanceof ApiError ? String(err.message) : "Could not delete role"); } finally { setSaving(false); }
  }

  return <main className="app-shell app-frame admin-page admin-detail-page"><AppNav /><section className="page-surface admin-surface">
    <div className="admin-detail-header"><BackButton to={`${prefix}/app/admin`} className="mobile-back-button" ariaLabel="Back to Admin" /><div><h1>Roles</h1></div></div>
    {!canManage && <p className="error-text">Role management access required.</p>}{error && <p className="error-text">{error}</p>}
    {canManage && <div className="admin-roles-layout">
      <aside className="admin-role-list" aria-label="Server roles">{roles.map((role) => <button key={role.id} type="button" className={role.id === selectedId ? "active" : ""} onClick={() => select(role)}><strong>{role.name}</strong><small>{role.isDefault ? "Default role" : `${role.memberCount} members`}</small></button>)}<button type="button" className="admin-role-create" onClick={() => { setSelectedId("new"); setDraft({ id: "new", name: "", description: "", permissions: [], isDefault: false, memberCount: 0 }); }}><span className="ms-icon ms-icon--18" aria-hidden="true">add</span>Create role</button></aside>
      {draft && <section className="admin-panel admin-role-editor"><label>Role name<input value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={saving} /></label><label>Description<input value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} disabled={saving} /></label><p className="admin-role-default">{draft.isDefault ? "Default role — it can be edited but not deleted." : "Custom role"}</p><div className="admin-role-permissions">{permissionGroups.map((group) => { const keys = group.permissions.map(([key]) => key); const allEnabled = keys.every((key) => draft.permissions.includes(key)); return <section className="admin-role-permission-group" key={group.name}><div className="admin-role-permission-group-heading"><h2>{group.name}</h2><label className="admin-role-group-toggle"><input type="checkbox" checked={allEnabled} onChange={() => togglePermissionGroup(keys)} disabled={saving} /><span>All</span></label></div><div className="admin-role-permission-options">{group.permissions.map(([key, label, helper]) => <label key={key}><input type="checkbox" checked={draft.permissions.includes(key)} onChange={() => togglePermission(key)} disabled={saving} /><span><strong>{label}</strong><small>{helper}</small></span></label>)}</div></section>; })}</div><div className="admin-member-actions"><button type="button" className="primary-button" onClick={() => void save()} disabled={saving || !draft.name.trim()}>Save role</button>{!draft.isDefault && draft.id !== "new" && <button type="button" className="danger-button" onClick={() => void remove()} disabled={saving}>Delete role</button>}</div></section>}
    </div>}
  </section></main>;
}
