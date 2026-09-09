import { useCallback, useEffect, useState } from "react";
import { BarChart3, Check, CheckSquare, Clipboard, Layers3, Plus, Puzzle, X } from "lucide-react";
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

const pluginStarter = `// backend/internal/plugins/builtins/example.go
type ExamplePlugin struct{}

func (p *ExamplePlugin) ID() string { return "plugin-example" }
func (p *ExamplePlugin) Name() string { return "Example plugin" }
func (p *ExamplePlugin) Init(services plugins.Services) error { return nil }
func (p *ExamplePlugin) RegisterRoutes(r chi.Router) {}
func (p *ExamplePlugin) SubscribeEvents(bus plugins.EventBus) {}`;

function PluginPreview({ kind }: { kind: PluginDetail["preview"] }) {
  if (kind === "statistics") return <div className="plugin-preview plugin-preview--stats" aria-hidden="true"><div className="plugin-preview-top"><span /><span /><span /></div><div className="plugin-preview-stat"><strong>128</strong><small>messages</small></div><div className="plugin-preview-bars"><i /><i /><i /><i /><i /><i /><i /><i /></div><div className="plugin-preview-legend"><span /><span /><span /></div></div>;
  if (kind === "canvas") return <div className="plugin-preview plugin-preview--canvas" aria-hidden="true"><span className="plugin-canvas-dot plugin-canvas-dot--one" /><span className="plugin-canvas-dot plugin-canvas-dot--two" /><div className="plugin-canvas-note plugin-canvas-note--one">Ideas</div><div className="plugin-canvas-note plugin-canvas-note--two">Plan</div><div className="plugin-canvas-line" /></div>;
  if (kind === "checklist") return <div className="plugin-preview plugin-preview--checklist" aria-hidden="true"><div className="plugin-checklist-line is-checked"><span className="plugin-check-box" /><span>Groceries</span></div><div className="plugin-checklist-line"><span className="plugin-check-box" /><span>Errands</span></div><div className="plugin-checklist-line is-checked"><span className="plugin-check-box" /><span>Tasks</span></div></div>;
  return <div className="plugin-preview plugin-preview--generic" aria-hidden="true"><Puzzle size={42} /></div>;
}

export default function AdminPluginsPage() {
  const { accessToken, authRequest, currentUser } = useAuth();
  const prefix = getClusterPrefix();
  const [plugins, setPlugins] = useState<PluginStatus[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [copiedStarter, setCopiedStarter] = useState(false);
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

  async function copyStarter() {
    try { await navigator.clipboard.writeText(pluginStarter); setCopiedStarter(true); window.setTimeout(() => setCopiedStarter(false), 1800); }
    catch { setError("Could not copy the plugin starter."); }
  }

  return <main className="app-shell app-frame admin-page admin-detail-page plugins-page"><AppNav /><section className="page-surface admin-surface plugins-surface">
    <header className="admin-detail-header plugins-header"><BackButton to={`${prefix}/app/admin`} className="mobile-back-button" ariaLabel="Back to admin" /><div><h1>Plugin store</h1></div></header>
    {!canManagePlugins && <p className="error-text">Admin access required.</p>}{error && <p className="error-text">{error}</p>}
    {canManagePlugins && <><section className="plugin-store-grid" aria-label="Available plugins">{plugins.map((plugin) => {
        const detail = pluginDetails[plugin.id] ?? { description: "An optional server extension.", icon: Layers3, eyebrow: "Extension", preview: "generic" as const };
        const Icon = detail.icon;
        return <article className="plugin-showcase-card" key={plugin.id}><PluginPreview kind={detail.preview} /><div className="plugin-showcase-content"><div className="plugin-showcase-title"><span className="plugin-icon"><Icon size={20} /></span><span><small>{detail.eyebrow}</small><h2>{plugin.name}</h2></span></div><p>{detail.description}</p></div><footer className="plugin-showcase-footer"><span className={plugin.enabled ? "plugin-status is-on" : "plugin-status"}>{plugin.enabled ? "Active" : "Paused"}</span><label className="plugin-switch"><input type="checkbox" checked={plugin.enabled} disabled={savingId === plugin.id} onChange={() => void togglePlugin(plugin)} /><span /><em className="visually-hidden">Enable {plugin.name}</em></label></footer></article>;
      })}<button className="plugin-add-card" type="button" onClick={() => setIsRegistering(true)}><span><Plus size={26} /></span><strong>Add a server plugin</strong><p>Register a trusted extension built for your Stovo server.</p></button></section>
      {!plugins.length && !error && <p className="stats-state">Loading available plugins…</p>}</>}
  </section>
  {isRegistering && <div className="plugin-register-backdrop" role="presentation" onMouseDown={() => setIsRegistering(false)}><section className="plugin-register-modal" role="dialog" aria-modal="true" aria-labelledby="plugin-register-title" onMouseDown={(event) => event.stopPropagation()}><button className="plugin-modal-close" type="button" aria-label="Close" onClick={() => setIsRegistering(false)}><X size={18} /></button><span className="plugin-store-intro-icon"><Puzzle size={22} /></span><h2 id="plugin-register-title">Register a server plugin</h2><p>Plugins run as trusted server code. Add the package to the backend, register it during bootstrap, then restart the server. It will appear here automatically for admins to enable.</p><ol><li>Implement Stovo’s <code>plugins.Plugin</code> interface.</li><li>Register the plugin in <code>backend/internal/bootstrap</code>.</li><li>Deploy the backend, then manage it here.</li></ol><button className="plugin-copy-button" type="button" onClick={() => void copyStarter()}>{copiedStarter ? <Check size={16} /> : <Clipboard size={16} />}{copiedStarter ? "Starter copied" : "Copy plugin starter"}</button></section></div>}
  </main>;
}
