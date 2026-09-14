import { useCallback, useEffect, useState } from "react";
import { BarChart3, CheckSquare, Layers3, Puzzle } from "lucide-react";
import { ApiError, getClusterPrefix } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { BackButton } from "../components/BackButton";

type PluginStatus = { id: string; name: string; enabled: boolean };
type PluginDetail = { description: string; icon: typeof BarChart3; eyebrow: string; preview: "statistics" | "canvas" | "checklist" | "generic" };

const pluginDetails: Record<string, PluginDetail> = {
  "plugin-rich-stats": { description: "Understand messages, reply time, conversation momentum, and the spaces your community uses most.", icon: BarChart3, eyebrow: "Analytics", preview: "statistics" },
  "plugin-canvas": { description: "Give everyone a shared, live canvas for notes, ideas, and visual collaboration.", icon: Layers3, eyebrow: "Collaboration", preview: "canvas" },
  "plugin-checklist": { description: "Interactive grocery and errand checklists in chat with live checkbox synchronization and Notion-style editing.", icon: CheckSquare, eyebrow: "Tasks", preview: "checklist" }
};

function PluginPreview({ kind }: { kind: PluginDetail["preview"] }) {
  if (kind === "statistics") return <div className="plugin-preview plugin-preview--stats" aria-hidden="true">
    <div className="plugin-preview-top"><span /><span /><span /><small>LIVE PULSE</small></div>
    <div className="plugin-preview-stat"><small>Messages this week</small><strong>128</strong><b>↗ 24%</b></div>
    <div className="plugin-preview-curve"><i /><i /><i /><i /><i /><i /></div>
    <div className="plugin-preview-bars"><i /><i /><i /><i /><i /><i /><i /><i /></div>
    <div className="plugin-preview-legend"><span>Mon</span><span>Wed</span><span>Sun</span></div>
  </div>;
  if (kind === "canvas") return <div className="plugin-preview plugin-preview--canvas" aria-hidden="true">
    <div className="plugin-canvas-toolbar"><span /><span /><span /><b>Untitled board</b></div>
    <div className="plugin-canvas-note plugin-canvas-note--one">Sketch</div><div className="plugin-canvas-note plugin-canvas-note--two">Launch</div><div className="plugin-canvas-note plugin-canvas-note--three">Share</div>
    <span className="plugin-canvas-avatar plugin-canvas-avatar--one">M</span><span className="plugin-canvas-avatar plugin-canvas-avatar--two">R</span>
    <div className="plugin-canvas-line plugin-canvas-line--one" /><div className="plugin-canvas-line plugin-canvas-line--two" />
  </div>;
  if (kind === "checklist") return <div className="plugin-preview plugin-preview--checklist" aria-hidden="true">
    <div className="plugin-checklist-label">TODAY <b>3 / 5</b></div>
    <div className="plugin-checklist-sheet"><div className="plugin-checklist-line is-checked"><span className="plugin-check-box" /><span>Groceries</span></div><div className="plugin-checklist-line"><span className="plugin-check-box" /><span>Errands</span></div><div className="plugin-checklist-line is-checked"><span className="plugin-check-box" /><span>Tasks</span></div></div>
    <span className="plugin-checklist-sticker">✓</span>
  </div>;
  return <div className="plugin-preview plugin-preview--generic" aria-hidden="true"><Puzzle size={42} /></div>;
}

export default function AdminPluginsPage() {
  const { accessToken, authRequest, currentUser } = useAuth();
  const prefix = getClusterPrefix();
  const [plugins, setPlugins] = useState<PluginStatus[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManagePlugins = currentUser?.role === "owner" || currentUser?.permissions?.includes("manage_server") === true;

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
    <header className="admin-detail-header plugins-header"><BackButton to={`${prefix}/app/admin`} className="mobile-back-button" ariaLabel="Back to admin" /><div><h1>Plugin store</h1></div></header>
    {!canManagePlugins && <p className="error-text">Admin access required.</p>}{error && <p className="error-text">{error}</p>}
    {canManagePlugins && <><section className="plugin-store-grid" aria-label="Available plugins">{plugins.map((plugin) => {
        const detail = pluginDetails[plugin.id] ?? { description: "An optional server extension.", icon: Layers3, eyebrow: "Extension", preview: "generic" as const };
        const Icon = detail.icon;
        return <article className="plugin-showcase-card" key={plugin.id}><PluginPreview kind={detail.preview} /><div className="plugin-showcase-content"><div className="plugin-showcase-title"><span className="plugin-icon"><Icon size={20} /></span><span><small>{detail.eyebrow}</small><h2>{plugin.name}</h2></span></div><p>{detail.description}</p></div><footer className="plugin-showcase-footer"><span className={plugin.enabled ? "plugin-status is-on" : "plugin-status"}>{plugin.enabled ? "Active" : "Paused"}</span><label className="plugin-switch"><input type="checkbox" checked={plugin.enabled} disabled={savingId === plugin.id} onChange={() => void togglePlugin(plugin)} /><span /><em className="visually-hidden">Enable {plugin.name}</em></label></footer></article>;
      })}<article className="plugin-showcase-card is-development" aria-label="Canvas hand-drawn diagrams plugin is in development"><PluginPreview kind="canvas" /><div className="plugin-showcase-content"><div className="plugin-showcase-title"><span className="plugin-icon"><Layers3 size={20} /></span><span><small>Canvas</small><h2>Hand-drawn diagrams</h2></span></div><p>Create freehand diagrams together on a shared canvas. This plugin is currently in development.</p></div><footer className="plugin-showcase-footer"><span className="plugin-status">In development</span></footer></article><article className="plugin-add-card is-development" aria-label="Server plugins are in development"><span><Puzzle size={26} /></span><strong>Server plugins</strong><p>Adding server plugins is currently in development.</p><small>In development</small></article></section>
      {!plugins.length && !error && <p className="stats-state">Loading available plugins…</p>}</>}
  </section>
  </main>;
}
