import { useCallback, useEffect, useState } from "react";

import { ApiError, getClusterPrefix } from "../api/client";
import { createServerRole, deleteServerRole, getServerRoles, ServerRole, updateServerRole } from "../api/family";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { BackButton } from "../components/BackButton";
import { useStrings } from "../i18n/LanguageContext";

export default function AdminRolesPage() {
  const strings = useStrings();
  const copy = strings.admin.roles;
  const permissionGroups = [
    { name: copy.groups.serverAdministration, permissions: [
      ["manage_server", ...copy.permissions.manageServer], ["manage_roles", ...copy.permissions.manageRoles],
    ] },
    { name: copy.groups.membersSpacesCalls, permissions: [
      ["manage_members", ...copy.permissions.manageMembers], ["manage_channels", ...copy.permissions.manageSpaces], ["manage_calls", ...copy.permissions.manageGuestLinks],
    ] },
    { name: copy.groups.contentModeration, permissions: [
      ["manage_messages", ...copy.permissions.manageMessages], ["manage_files", ...copy.permissions.manageFiles],
    ] },
    { name: copy.groups.billingConnections, permissions: [
      ["manage_plans", ...copy.permissions.managePlans], ["manage_integrations", ...copy.permissions.manageIntegrations],
    ] },
  ] as const;
  const premiumGroups = [
    { title: strings.admin.rbac.chatCreationLimits, description: strings.admin.rbac.chatCreationLimitsDesc, options: Object.values(copy.premium.chatCreation) },
    { title: strings.admin.rbac.advancedRestrictions, description: copy.premium.lockedDescription, options: Object.values(copy.premium.restrictions) },
  ];
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
    } catch (err) { setError(err instanceof ApiError ? String(err.message) : copy.couldNotLoad); }
  }, [accessToken, copy.couldNotLoad]);

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
    } catch (err) { setError(err instanceof ApiError ? String(err.message) : copy.couldNotSave); } finally { setSaving(false); }
  }
  async function remove() {
    if (!accessToken || !draft || draft.isDefault) return;
    const replacement = roles.find((role) => role.id !== draft.id);
    if (!replacement || !window.confirm(copy.deleteConfirmation(draft.name, replacement.name))) return;
    setSaving(true); setError(null);
    try { await deleteServerRole(accessToken, draft.id, replacement.id); setSelectedId(null); await load(); }
    catch (err) { setError(err instanceof ApiError ? String(err.message) : copy.couldNotDelete); } finally { setSaving(false); }
  }

  return <main className="app-shell app-frame admin-page admin-detail-page"><AppNav /><section className="page-surface admin-surface">
    <div className="admin-detail-header"><BackButton to={`${prefix}/app/admin`} className="mobile-back-button" ariaLabel={copy.backToAdmin} /><div><h1>{copy.title}</h1></div></div>
    {!canManage && <p className="error-text">{copy.adminAccessRequired}</p>}{error && <p className="error-text">{error}</p>}
    {canManage && <div className="admin-roles-layout">
      <aside className="admin-role-list" aria-label={copy.serverRoles}>{roles.map((role) => <button key={role.id} type="button" className={role.id === selectedId ? "active" : ""} onClick={() => select(role)}><strong>{role.name}</strong><small>{role.isDefault ? copy.defaultRole : copy.members(role.memberCount)}</small></button>)}<button type="button" className="admin-role-create" onClick={() => { setSelectedId("new"); setDraft({ id: "new", name: "", description: "", permissions: [], isDefault: false, memberCount: 0 }); }}><span className="ms-icon ms-icon--18" aria-hidden="true">add</span>{copy.createRole}</button></aside>
      {draft && <section className="admin-panel admin-role-editor"><label><span>{copy.roleName}</span><input value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={saving} /></label><label><span>{copy.description}</span><input value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} disabled={saving} /></label><p className="admin-role-default">{draft.isDefault ? copy.defaultRoleDescription : copy.customRole}</p><div className="admin-role-permissions">{permissionGroups.map((group) => { const keys = group.permissions.map(([key]) => key); const allEnabled = keys.every((key) => draft.permissions.includes(key)); return <section className="admin-role-permission-group" key={group.name}><div className="admin-role-permission-group-heading"><h2>{group.name}</h2><label className="admin-role-group-toggle"><input type="checkbox" checked={allEnabled} onChange={() => togglePermissionGroup(keys)} disabled={saving} /><span>{copy.all}</span></label></div><div className="admin-role-permission-options">{group.permissions.map(([key, label, helper]) => <label key={key}><input type="checkbox" checked={draft.permissions.includes(key)} onChange={() => togglePermission(key)} disabled={saving} /><span><strong>{label}</strong><small>{helper}</small></span></label>)}</div></section>; })}
        {premiumGroups.map((group) => <section className="admin-role-permission-group admin-role-premium-group" key={group.title} aria-disabled="true"><div className="admin-role-permission-group-heading"><div><h2>{group.title}</h2><small>{group.description}</small></div><span className="premium-feature-badge">{strings.admin.encryption.premium}</span></div><label className="admin-role-group-toggle admin-role-premium-all"><input type="checkbox" disabled aria-label={`${copy.all} (${strings.admin.encryption.premium})`} /><span>{copy.all}</span><small>{copy.premium.allDescription}</small></label><div className="admin-role-permission-options">{group.options.map(([label, description]) => <label key={label}><input type="checkbox" disabled aria-label={`${label} (${strings.admin.encryption.premium})`} /><span><strong>{label}</strong><small>{description}</small></span></label>)}</div></section>)}
      </div><div className="admin-member-actions"><button type="button" className="primary-button" onClick={() => void save()} disabled={saving || !draft.name.trim()}>{copy.saveRole}</button>{!draft.isDefault && draft.id !== "new" && <button type="button" className="danger-button" onClick={() => void remove()} disabled={saving}>{copy.deleteRole}</button>}</div></section>}
    </div>}
  </section></main>;
}
