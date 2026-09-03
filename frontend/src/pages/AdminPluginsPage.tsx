import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, ChevronLeft, ChevronRight, Layers3, Sparkles } from "lucide-react";
import { ApiError, getClusterPrefix } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";

type PluginStatus = { id: string; name: string; enabled: boolean };
const pluginDetails: Record<string, { description: string; icon: typeof BarChart3 }> = {
  "plugin-rich-stats": { description: "Private server and chat insights, reply trends, highlights, and your Year with Stovo.", icon: BarChart3 }
};

export default function AdminPluginsPage() {
  const { accessToken, authRequest, currentUser } = useAuth();
  const prefix = getClusterPrefix();
  const [plugins, setPlugins] = useState<PluginStatus[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManagePlugins = currentUser?.role === "owner" || currentUser?.role === "admin";
  const load = useCallback(async () => {
    if (!accessToken || !canManagePlugins) return;
    try { setPlugins(await authRequest<PluginStatus[]>("/api/admin/plugins")); setError(null); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "Could not load plugins"); }
  }, [accessToken, authRequest, canManagePlugins]);
  useEffect(() => { void load(); }, [load]);
  async function togglePlugin(plugin: PluginStatus) {
    setSavingId(plugin.id); setError(null);
    try {
      const updated = await authRequest<PluginStatus>(`/api/admin/plugins/${plugin.id}`, { method: "PATCH", body: { enabled: !plugin.enabled } });
      setPlugins((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "Could not update plugin"); }
    finally { setSavingId(null); }
  }
  return <main className="app-shell app-frame admin-page admin-detail-page plugins-page"><AppNav /><section className="page-surface admin-surface plugins-surface">
    <header className="plugins-header"><Link to={`${prefix}/app/admin`} className="stats-back" aria-label="Back to admin"><ChevronLeft size={18} /></Link><div><p className="stats-kicker">Server administration</p><h1>Plugin store</h1><p>Turn optional server experiences on or off in one place.</p></div></header>
    {!canManagePlugins && <p className="error-text">Admin access required.</p>}{error && <p className="error-text">{error}</p>}
    {canManagePlugins && <section className="plugin-list">{plugins.map((plugin) => {
      const detail = pluginDetails[plugin.id]; const Icon = detail?.icon ?? Layers3;
      return <article className="plugin-card" key={plugin.id}><span className="plugin-icon"><Icon size={22} /></span><div className="plugin-copy"><div><h2>{plugin.name}</h2><span className={plugin.enabled ? "plugin-status is-on" : "plugin-status"}>{plugin.enabled ? "Enabled" : "Disabled"}</span></div><p>{detail?.description ?? "An optional server extension."}</p>{plugin.id === "plugin-rich-stats" && plugin.enabled && <Link to={`${prefix}/app/admin/stats`} className="plugin-dashboard-link"><Sparkles size={15} /> Open dashboard <ChevronRight size={15} /></Link>}</div><label className="plugin-switch"><input type="checkbox" checked={plugin.enabled} disabled={savingId === plugin.id} onChange={() => void togglePlugin(plugin)} /><span /><em className="visually-hidden">Enable {plugin.name}</em></label></article>;
    })}{!plugins.length && !error && <p className="stats-state">Loading available plugins…</p>}</section>}
  </section></main>;
}
