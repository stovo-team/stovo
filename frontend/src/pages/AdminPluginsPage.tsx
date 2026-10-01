import { useCallback, useEffect, useState } from "react";
import { BarChart3, CheckSquare, Layers3, Puzzle } from "lucide-react";
import { ApiError, getClusterPrefix } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { BackButton } from "../components/BackButton";
import { useStrings } from "../i18n/LanguageContext";
import type { AppStrings } from "../config/strings";

type PluginStatus = { id: string; name: string; enabled: boolean };
type PluginStrings = AppStrings["admin"]["plugins"];
type PluginDetail = { name: "statistics" | "canvas" | "checklist"; description: "statisticsDescription" | "canvasDescription" | "checklistDescription"; icon: typeof BarChart3; eyebrow: "analytics" | "collaboration" | "tasks"; preview: "statistics" | "canvas" | "diagrams" | "checklist" | "generic" };

const pluginDetails: Record<string, PluginDetail> = {
  "plugin-rich-stats": { name: "statistics", description: "statisticsDescription", icon: BarChart3, eyebrow: "analytics", preview: "statistics" },
  "plugin-canvas": { name: "canvas", description: "canvasDescription", icon: Layers3, eyebrow: "collaboration", preview: "canvas" },
  "plugin-checklist": { name: "checklist", description: "checklistDescription", icon: CheckSquare, eyebrow: "tasks", preview: "checklist" }
};

function SharedCanvasPreview() {
  return (
    <div className="plugin-preview plugin-preview--canvas" aria-hidden="true">
      <svg className="plugin-canvas-svg" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="canvas-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="rgba(167, 139, 250, 0.22)" />
          </pattern>
          <linearGradient id="card-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2e2248" />
            <stop offset="100%" stopColor="#1a142c" />
          </linearGradient>
          <linearGradient id="card-grad-2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#222e48" />
            <stop offset="100%" stopColor="#141c2e" />
          </linearGradient>
          <linearGradient id="card-grad-3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#352438" />
            <stop offset="100%" stopColor="#1d1322" />
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill="#12101b" />
        <rect width="320" height="180" fill="url(#canvas-grid)" />

        {/* Connection paths */}
        <path d="M 102 65 C 135 65, 140 115, 172 115" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="4 3" opacity="0.85" />
        <path d="M 248 115 C 262 115, 260 65, 272 65" stroke="#a78bfa" strokeWidth="2" opacity="0.75" />

        {/* Node 1 */}
        <rect x="32" y="42" width="70" height="46" rx="8" fill="url(#card-grad-1)" stroke="#8b5cf6" strokeWidth="1.5" />
        <rect x="42" y="52" width="36" height="6" rx="3" fill="#c4b5fd" />
        <rect x="42" y="64" width="50" height="4" rx="2" fill="rgba(196, 181, 253, 0.45)" />
        <rect x="42" y="72" width="30" height="4" rx="2" fill="rgba(196, 181, 253, 0.3)" />

        {/* Node 2 - Focused / Selected */}
        <rect x="172" y="90" width="76" height="50" rx="8" fill="url(#card-grad-2)" stroke="#38bdf8" strokeWidth="1.5" />
        <rect x="169" y="87" width="6" height="6" rx="1" fill="#38bdf8" />
        <rect x="245" y="87" width="6" height="6" rx="1" fill="#38bdf8" />
        <rect x="169" y="137" width="6" height="6" rx="1" fill="#38bdf8" />
        <rect x="245" y="137" width="6" height="6" rx="1" fill="#38bdf8" />
        <rect x="182" y="102" width="40" height="6" rx="3" fill="#7dd3fc" />
        <rect x="182" y="114" width="54" height="4" rx="2" fill="rgba(125, 211, 252, 0.45)" />
        <rect x="182" y="122" width="34" height="4" rx="2" fill="rgba(125, 211, 252, 0.3)" />

        {/* Node 3 */}
        <rect x="272" y="42" width="36" height="46" rx="8" fill="url(#card-grad-3)" stroke="#f472b6" strokeWidth="1.5" />
        <circle cx="290" cy="65" r="9" fill="none" stroke="#f472b6" strokeWidth="1.5" />

        {/* Live Collaborator Cursors */}
        <g transform="translate(142, 52)">
          <path d="M0 0 L9 9 L5 10 L8 15 L6 16 L3 11 L1 13 Z" fill="#ec4899" />
          <rect x="11" y="9" width="36" height="15" rx="4" fill="#ec4899" />
          <text x="16" y="20" fill="#fff" fontSize="9" fontWeight="bold" fontFamily="system-ui, sans-serif">Mia</text>
        </g>
        <g transform="translate(230, 72)">
          <path d="M0 0 L9 9 L5 10 L8 15 L6 16 L3 11 L1 13 Z" fill="#38bdf8" />
          <rect x="11" y="9" width="40" height="15" rx="4" fill="#38bdf8" />
          <text x="15" y="20" fill="#fff" fontSize="9" fontWeight="bold" fontFamily="system-ui, sans-serif">Noah</text>
        </g>
      </svg>
    </div>
  );
}

function HandDrawnDiagramPreview({ copy }: { copy: PluginStrings }) {
  return (
    <div className="plugin-preview plugin-preview--diagrams" aria-hidden="true">
      <svg className="plugin-diagram-svg" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="diag-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#141724" />
            <stop offset="100%" stopColor="#0d0f18" />
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill="url(#diag-bg)" />

        {/* Architectural sketch grid */}
        <path d="M 0 45 L 320 45 M 0 90 L 320 90 M 0 135 L 320 135 M 80 0 L 80 180 M 160 0 L 160 180 M 240 0 L 240 180" stroke="rgba(56, 189, 248, 0.08)" strokeWidth="1" strokeDasharray="3 3" />

        {/* Client Box */}
        <path d="M 32 62 Q 30 92 33 122 Q 62 120 94 122 Q 95 90 92 60 Q 60 63 32 62 Z" stroke="#38bdf8" strokeWidth="2" fill="rgba(56, 189, 248, 0.08)" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 34 64 L 90 64 L 92 120 L 34 118 Z" stroke="#38bdf8" strokeWidth="1" opacity="0.35" strokeLinecap="round" strokeLinejoin="round" />
        <text x="44" y="96" fill="#e0f2fe" fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif">{copy.client}</text>

        {/* Hand-drawn Arrow 1 */}
        <path d="M 98 88 Q 120 84 142 88" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
        <path d="M 134 82 L 144 88 L 134 94" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* API Server Box */}
        <path d="M 148 50 Q 146 95 150 136 Q 180 134 212 136 Q 214 92 210 52 Q 180 50 148 50 Z" stroke="#818cf8" strokeWidth="2" fill="rgba(129, 140, 248, 0.08)" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 150 53 L 208 51 L 210 133 L 152 134 Z" stroke="#818cf8" strokeWidth="1" opacity="0.35" strokeLinecap="round" strokeLinejoin="round" />
        <text x="162" y="88" fill="#e0e7ff" fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif">API</text>
        <text x="157" y="104" fill="#a5b4fc" fontSize="9" fontFamily="system-ui, sans-serif">{copy.server}</text>

        {/* Hand-drawn Arrow 2 */}
        <path d="M 218 88 Q 236 85 252 88" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" />
        <path d="M 244 82 L 254 88 L 244 94" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Database Cylinder */}
        <ellipse cx="282" cy="70" rx="24" ry="9" stroke="#34d399" strokeWidth="2" fill="rgba(52, 211, 153, 0.08)" />
        <path d="M 258 70 Q 257 95 258 116 Q 282 126 306 116 Q 307 94 306 70" stroke="#34d399" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M 258 92 Q 282 102 306 92" stroke="#34d399" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
        <ellipse cx="282" cy="116" rx="24" ry="9" stroke="#34d399" strokeWidth="1.5" fill="none" />
        <text x="273" y="100" fill="#a7f3d0" fontSize="10" fontWeight="600" fontFamily="system-ui, sans-serif">DB</text>
      </svg>
    </div>
  );
}

function PluginPreview({ kind, copy }: { kind: PluginDetail["preview"]; copy: PluginStrings }) {
  if (kind === "statistics") return <div className="plugin-preview plugin-preview--stats" aria-hidden="true">
    <div className="plugin-preview-top"><span /><span /><span /><small>{copy.previewPulse}</small></div>
    <div className="plugin-preview-stat"><small>{copy.messagesThisWeek}</small><strong>128</strong><b>↗ 24%</b></div>
    <div className="plugin-preview-curve"><i /><i /><i /><i /><i /><i /></div>
    <div className="plugin-preview-bars"><i /><i /><i /><i /><i /><i /><i /><i /></div>
    <div className="plugin-preview-legend"><span>{copy.monday}</span><span>{copy.wednesday}</span><span>{copy.sunday}</span></div>
  </div>;
  if (kind === "canvas") return <SharedCanvasPreview />;
  if (kind === "diagrams") return <HandDrawnDiagramPreview copy={copy} />;
  if (kind === "checklist") return <div className="plugin-preview plugin-preview--checklist" aria-hidden="true">
    <div className="plugin-checklist-label">{copy.today} <b>3 / 5</b></div>
    <div className="plugin-checklist-sheet"><div className="plugin-checklist-line is-checked"><span className="plugin-check-box" /><span>{copy.groceries}</span></div><div className="plugin-checklist-line"><span className="plugin-check-box" /><span>{copy.errands}</span></div><div className="plugin-checklist-line is-checked"><span className="plugin-check-box" /><span>{copy.checklistTasks}</span></div></div>
    <span className="plugin-checklist-sticker">✓</span>
  </div>;
  return <div className="plugin-preview plugin-preview--generic" aria-hidden="true"><Puzzle size={42} /></div>;
}

export default function AdminPluginsPage() {
  const strings = useStrings();
  const copy = strings.admin.plugins;
  const { accessToken, authRequest, currentUser } = useAuth();
  const prefix = getClusterPrefix();
  const [plugins, setPlugins] = useState<PluginStatus[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManagePlugins = currentUser?.role === "owner" || currentUser?.permissions?.includes("manage_server") === true;

  const load = useCallback(async () => {
    if (!accessToken || !canManagePlugins) return;
    try { setPlugins(await authRequest<PluginStatus[]>("/api/admin/plugins")); setError(null); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : copy.loadFailed); }
  }, [accessToken, authRequest, canManagePlugins, copy.loadFailed]);
  useEffect(() => { void load(); }, [load]);

  async function togglePlugin(plugin: PluginStatus) {
    setSavingId(plugin.id); setError(null);
    try {
      const updated = await authRequest<PluginStatus>(`/api/admin/plugins/${plugin.id}`, { method: "PATCH", body: { enabled: !plugin.enabled } });
      setPlugins((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : copy.updateFailed); }
    finally { setSavingId(null); }
  }

  return <main className="app-shell app-frame admin-page admin-detail-page plugins-page"><AppNav /><section className="page-surface admin-surface plugins-surface">
    <header className="admin-detail-header plugins-header"><BackButton to={`${prefix}/app/admin`} className="mobile-back-button" ariaLabel={copy.backToAdmin} /><div><h1>{copy.title}</h1></div></header>
    {!canManagePlugins && <p className="error-text">{copy.adminAccessRequired}</p>}{error && <p className="error-text">{error}</p>}
    {canManagePlugins && <><section className="plugin-store-grid" aria-label={copy.availablePlugins}>{plugins.map((plugin) => {
        const detail = pluginDetails[plugin.id];
        const pluginName = detail ? copy[detail.name] : plugin.name;
        const pluginDescription = detail ? copy[detail.description] : copy.optionalExtension;
        const Icon = detail?.icon ?? Layers3;
        return <article className="plugin-showcase-card" key={plugin.id}><PluginPreview kind={detail?.preview ?? "generic"} copy={copy} /><div className="plugin-showcase-content"><div className="plugin-showcase-title"><span className="plugin-icon"><Icon size={20} /></span><span><small>{detail ? copy[detail.eyebrow] : copy.extension}</small><h2>{pluginName}</h2></span></div><p>{pluginDescription}</p></div><footer className="plugin-showcase-footer"><span className={plugin.enabled ? "plugin-status is-on" : "plugin-status"}>{plugin.enabled ? copy.active : copy.paused}</span><label className="plugin-switch"><input type="checkbox" aria-label={copy.enablePlugin(pluginName)} checked={plugin.enabled} disabled={savingId === plugin.id} onChange={() => void togglePlugin(plugin)} /><span /><em className="visually-hidden">{copy.enablePlugin(pluginName)}</em></label></footer></article>;
      })}<article className="plugin-showcase-card is-development" aria-label={`${copy.diagrams}: ${copy.development}`}><PluginPreview kind="diagrams" copy={copy} /><div className="plugin-showcase-content"><div className="plugin-showcase-title"><span className="plugin-icon"><Layers3 size={20} /></span><span><small>{copy.canvas}</small><h2>{copy.diagrams}</h2></span></div><p>{copy.diagramsDescription}</p></div><footer className="plugin-showcase-footer"><span className="plugin-status">{copy.development}</span></footer></article><article className="plugin-add-card is-development" aria-label={`${copy.serverPlugins}: ${copy.development}`}><span><Puzzle size={26} /></span><strong>{copy.serverPlugins}</strong><p>{copy.serverPluginsDescription}</p><small>{copy.development}</small></article></section>
      {!plugins.length && !error && <p className="stats-state">{copy.loading}</p>}</>}
  </section>
  </main>;
}
