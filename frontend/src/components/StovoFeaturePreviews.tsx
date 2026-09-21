"use client";

import { useState } from "react";
import {
  Check,
  CheckSquare,
  Cpu,
  FileText,
  Folder,
  Hash,
  Headphones,
  Image as ImageIcon,
  LockKeyhole,
  Mic,
  MoreHorizontal,
  MoreVertical,
  MessageCircle,
  MessageSquare,
  Palette,
  Pause,
  Play,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Users,
  Video,
} from "lucide-react";

export function AudiencePreview({ kind }: { kind: "workspace" | "voice" | "files" }) {
  if (kind === "voice") {
    const people = [
      { name: "Alex", role: "Speaking", avatar: "/avatars/user-alex.webp", active: true },
      { name: "Mira", role: "Listening", avatar: "/avatars/user-mira.webp", active: false },
      { name: "Noah", role: "Muted", avatar: "/avatars/user-noah.webp", active: false },
    ];
    return (
      <div className="stovo-feature-preview stovo-voice-preview" aria-label="Stovo voice channel preview">
        <header>
          <span className="stovo-feature-dot" />
          <strong>Raid planning</strong>
          <small>Voice channel</small>
          <MoreHorizontal size={15} />
        </header>
        <div className="stovo-voice-stage">
          {people.map((p) => (
            <div className={`stovo-person ${p.active ? "speaking" : ""}`} key={p.name}>
              <img src={p.avatar} alt={p.name} className="stovo-person-avatar" />
              <b>{p.name}</b>
              <small>{p.role}</small>
            </div>
          ))}
        </div>
        <footer>
          <button aria-label="Mute microphone"><Mic size={15} /></button>
          <button aria-label="Start camera"><Video size={15} /></button>
          <button className="hangup">Leave</button>
        </footer>
      </div>
    );
  }

  if (kind === "files") {
    return (
      <div className="stovo-feature-preview stovo-files-mini" aria-label="Stovo storage preview">
        <header>
          <strong>Storage</strong>
          <span>Family space</span>
          <button>Upload</button>
        </header>
        <div className="stovo-files-mini-grid">
          <article className="photo has-thumb">
            <div className="stovo-file-thumb-container">
              <img src="/avatars/album-weekend.webp" alt="Weekend" className="stovo-file-thumb" />
            </div>
            <b>Weekend</b>
            <small>24 photos</small>
          </article>
          <article className="document">
            <FileText size={21} />
            <b>School forms</b>
            <small>PDF</small>
          </article>
          <article className="folder">
            <Folder size={21} />
            <b>Documents</b>
            <small>8 files</small>
          </article>
        </div>
      </div>
    );
  }

  const workspaceChats = [
    {
      name: "General",
      meta: "4 members",
      avatar: "/avatars/chat-general.webp",
      active: false,
    },
    {
      name: "Design review",
      meta: "Mira: I shared the latest draft",
      avatar: "/avatars/chat-design.webp",
      active: true,
    },
    {
      name: "Launch checklist",
      meta: "2 new messages",
      avatar: "/avatars/chat-launch.webp",
      badge: 2,
      active: false,
    },
  ];

  return (
    <div className="stovo-feature-preview stovo-workspace-mini" aria-label="Stovo workspace preview">
      <header>
        <img src="/avatars/studio.webp" alt="Studio" className="stovo-space-avatar" />
        <strong>Studio</strong>
        <span className="stovo-online">3 online</span>
      </header>
      <label>
        <Search size={14} />
        <span>Search chats</span>
      </label>
      {workspaceChats.map((chat) => (
        <div className={`stovo-mini-chat ${chat.active ? "active" : ""}`} key={chat.name}>
          <img src={chat.avatar} alt={chat.name} className="stovo-chat-avatar" />
          <div>
            <b>{chat.name}</b>
            <small>{chat.meta}</small>
          </div>
          {chat.badge && <i>{chat.badge}</i>}
        </div>
      ))}
    </div>
  );
}

export function StoragePreview() {
  const [activeTab, setActiveTab] = useState<"all" | "docs" | "canvas">("all");
  const [selectedSource, setSelectedSource] = useState<"engineering" | "all" | "vault">("engineering");

  return (
    <div className="stovo-storage-preview-window" aria-label="Stovo Storage preview">
      {/* Top window chrome */}
      <div className="storage-preview-titlebar">
        <div className="storage-preview-dots">
          <span className="dot dot-red" />
          <span className="dot dot-amber" />
          <span className="dot dot-green" />
          <span className="storage-preview-path">stovo.internal // storage-vault // #engineering</span>
        </div>
        <div className="storage-preview-status-tags">
          <span className="tag-s3">● MinIO S3 Online</span>
          <span className="tag-vault">AES-256 Vault</span>
        </div>
      </div>

      {/* Split body: Sources sidebar + Main files area */}
      <div className="storage-preview-body">
        {/* Left sources sidebar */}
        <aside className="storage-preview-sidebar">
          <div className="sidebar-group">
            <span className="sidebar-label">Connected Chats</span>
            <button
              type="button"
              className={`sidebar-item ${selectedSource === "engineering" ? "active" : ""}`}
              onClick={() => setSelectedSource("engineering")}
            >
              <Hash size={13} className="item-icon channel-hash" />
              <div className="item-meta">
                <strong>#engineering</strong>
                <small>3 files shared</small>
              </div>
            </button>
            <button
              type="button"
              className={`sidebar-item ${selectedSource === "all" ? "active" : ""}`}
              onClick={() => setSelectedSource("all")}
            >
              <MessageSquare size={13} className="item-icon" />
              <div className="item-meta">
                <strong>All conversations</strong>
                <small>59 files total</small>
              </div>
            </button>
          </div>

          <div className="sidebar-group">
            <span className="sidebar-label">Vault Folders</span>
            <button
              type="button"
              className={`sidebar-item ${selectedSource === "vault" ? "active" : ""}`}
              onClick={() => setSelectedSource("vault")}
            >
              <Folder size={13} className="item-icon folder-gold" />
              <div className="item-meta">
                <strong>/Projects/Docs</strong>
                <small>Auto-synced vault</small>
              </div>
            </button>
          </div>

          <div className="sidebar-quota-box">
            <div className="quota-row">
              <span>S3 Quota</span>
              <strong>1.4 TB / 4 TB</strong>
            </div>
            <div className="quota-bar-track">
              <div className="quota-bar-fill" style={{ width: "35%" }} />
            </div>
            <small>MinIO distributed cluster</small>
          </div>
        </aside>

        {/* Main files content */}
        <main className="storage-preview-main">
          {/* Connected message origin banner */}
          <div className="storage-chat-origin-card">
            <div className="origin-avatar">AK</div>
            <div className="origin-copy">
              <div className="origin-header">
                <strong>Alex Kim</strong>
                <span className="origin-channel">in #engineering</span>
                <time>10:44 AM</time>
              </div>
              <p>“Attaching the updated Architecture specification and launch canvas for review.”</p>
            </div>
            <span className="origin-sync-badge">
              <Check size={11} /> Auto-Saved
            </span>
          </div>

          {/* Search and filters toolbar */}
          <div className="storage-preview-toolbar">
            <label className="storage-preview-search">
              <Search size={14} />
              <input placeholder="Search files in #engineering..." readOnly />
            </label>
            <div className="storage-preview-filters">
              <button
                type="button"
                className={activeTab === "all" ? "active" : ""}
                onClick={() => setActiveTab("all")}
              >
                All (3)
              </button>
              <button
                type="button"
                className={activeTab === "docs" ? "active" : ""}
                onClick={() => setActiveTab("docs")}
              >
                Documents (2)
              </button>
              <button
                type="button"
                className={activeTab === "canvas" ? "active" : ""}
                onClick={() => setActiveTab("canvas")}
              >
                Canvases (1)
              </button>
            </div>
          </div>

          {/* Files grid showcasing the file with layout preview */}
          <div className="storage-preview-grid">
            {/* 1. Architecture.pdf (With realistic sheet layout preview - matching hero demo) */}
            {(activeTab === "all" || activeTab === "docs") && (
              <article className="storage-preview-tile">
                <div className="tile-top-bar">
                  <span className="doc-kind-badge pdf">
                    <FileText size={12} /> PDF
                  </span>
                  <span className="tile-vault-badge">
                    <Shield size={10} /> Synced
                  </span>
                </div>

                {/* The document sheet layout preview - matching hero demo */}
                <div className="stovo-doc-sheet-preview">
                  <div className="stovo-doc-sheet-page">
                    <div className="stovo-doc-sheet-title-bar" />
                    <div className="stovo-doc-sheet-line line-long" />
                    <div className="stovo-doc-sheet-line line-mid" />
                    <div className="stovo-doc-sheet-line line-short" />
                    <div className="stovo-doc-sheet-table">
                      <div className="stovo-doc-table-row">
                        <span style={{ width: "35%" }} />
                        <span style={{ width: "25%" }} />
                        <span style={{ width: "30%" }} />
                      </div>
                      <div className="stovo-doc-table-row">
                        <span style={{ width: "30%" }} />
                        <span style={{ width: "20%" }} />
                        <span style={{ width: "25%" }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="tile-footer-info">
                  <strong>Architecture.pdf</strong>
                  <div className="tile-meta-row">
                    <span>2.4 MB · 14 pages</span>
                    <span className="tile-origin-pill">#engineering</span>
                  </div>
                </div>
              </article>
            )}

            {/* 2. Launch readiness.canvas (With canvas board preview - matching hero demo) */}
            {(activeTab === "all" || activeTab === "canvas") && (
              <article className="storage-preview-tile canvas-tile">
                <div className="tile-top-bar">
                  <span className="doc-kind-badge canvas">
                    <StickyNote size={12} /> CANVAS
                  </span>
                  <span className="tile-vault-badge">
                    <Check size={10} /> Live
                  </span>
                </div>

                {/* The canvas board layout preview - matching hero demo */}
                <div className="stovo-canvas-board-viewport">
                  <div className="stovo-canvas-mini-node node-indigo">
                    <b># Release Gate</b>
                    <p>Security verified</p>
                  </div>
                  <div className="stovo-canvas-mini-node node-cyan">
                    <b># Telemetry</b>
                    <p>99.99% sync</p>
                  </div>
                  <div className="stovo-canvas-mini-node node-emerald">
                    <b># Client Audit</b>
                    <p>EU residency</p>
                  </div>
                </div>

                <div className="tile-footer-info">
                  <strong>Launch readiness.canvas</strong>
                  <div className="tile-meta-row">
                    <span>18 cards · 6 editors</span>
                    <span className="tile-origin-pill">#engineering</span>
                  </div>
                </div>
              </article>
            )}

            {/* 3. stovo-sec-audit-2026.pdf (With sheet layout preview - matching hero demo) */}
            {(activeTab === "all" || activeTab === "docs") && (
              <article className="storage-preview-tile">
                <div className="tile-top-bar">
                  <span className="doc-kind-badge pdf">
                    <FileText size={12} /> PDF
                  </span>
                  <span className="tile-vault-badge">
                    <Shield size={10} /> Synced
                  </span>
                </div>

                {/* The document sheet layout preview - matching hero demo */}
                <div className="stovo-doc-sheet-preview">
                  <div className="stovo-doc-sheet-page">
                    <div className="stovo-doc-sheet-title-bar" style={{ width: "50%" }} />
                    <div className="stovo-doc-sheet-line line-long" />
                    <div className="stovo-doc-sheet-line line-mid" />
                    <div className="stovo-doc-sheet-line line-short" />
                    <div className="stovo-doc-sheet-table">
                      <div className="stovo-doc-table-row">
                        <span style={{ width: "40%" }} />
                        <span style={{ width: "30%" }} />
                        <span style={{ width: "20%" }} />
                      </div>
                      <div className="stovo-doc-table-row">
                        <span style={{ width: "25%" }} />
                        <span style={{ width: "45%" }} />
                        <span style={{ width: "20%" }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="tile-footer-info">
                  <strong>stovo-sec-audit-2026.pdf</strong>
                  <div className="tile-meta-row">
                    <span>4.2 MB · 28 pages</span>
                    <span className="tile-origin-pill">/Projects/Docs</span>
                  </div>
                </div>
              </article>
            )}
          </div>

          {/* Bottom security footer */}
          <div className="storage-preview-footer">
            <span className="footer-left">
              <Shield size={12} />
              <span>Files from conversations are encrypted at rest with zero cloud lock-in</span>
            </span>
            <span className="footer-right">Local S3 · MinIO</span>
          </div>
        </main>
      </div>
    </div>
  );
}

export function TranscriptPreview() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSegment, setActiveSegment] = useState<number>(0);
  const [tasks, setTasks] = useState([
    {
      id: 1,
      text: "Share revised mobile drawer screens & specs",
      assignee: "Mira Chen",
      role: "Design Lead",
      avatar: "/avatars/user-mira.webp",
      done: true,
      tag: "Linear #142",
      due: "Wed 5 PM",
    },
    {
      id: 2,
      text: "Schedule final cross-platform review for Thursday",
      assignee: "Noah Vance",
      role: "Product Lead",
      avatar: "/avatars/user-noah.webp",
      done: false,
      tag: "Cal Sync",
      due: "Thu 11 AM",
    },
    {
      id: 3,
      text: "Publish signed meeting notes & push to shared vault",
      assignee: "Ivan",
      role: "Core Team",
      avatar: "/avatars/user-alex.webp",
      done: false,
      tag: "MinIO Vault",
      due: "Thu 2 PM",
    },
  ]);

  const toggleTask = (id: number) => {
    setTasks((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    );
  };

  const completedCount = tasks.filter((t) => t.done).length;

  const waveformHeights = [
    24, 38, 55, 32, 70, 48, 85, 92, 60, 40, 68, 88, 52, 78, 96, 64,
    42, 82, 90, 58, 36, 74, 94, 62, 45, 80, 50, 66, 38, 72, 86, 44
  ];

  return (
    <div className="stovo-transcript-preview" aria-label="Stovo AI Notes preview">
      {/* Header bar */}
      <header className="stovo-transcript-header">
        <div className="stovo-transcript-header-left">
          <img src="/avatars/chat-design.webp" alt="Design review" className="stovo-transcript-avatar" />
          <div className="stovo-transcript-header-meta">
            <div className="stovo-transcript-header-title-row">
              <strong>Design review</strong>
              <span className="stovo-call-ended-pill">Call ended · 38m 14s</span>
            </div>
            <div className="stovo-transcript-header-sub">
              <span className="stovo-attendee-count">4 participants</span>
              <div className="stovo-participants-stack">
                <img src="/avatars/user-mira.webp" alt="Mira" title="Mira Chen" />
                <img src="/avatars/user-noah.webp" alt="Noah" title="Noah Vance" />
                <img src="/avatars/user-alex.webp" alt="Alex" title="Alex Kim" />
                <span className="stovo-participant-bubble" title="Ivan">IV</span>
              </div>
            </div>
          </div>
        </div>

        <div className="stovo-transcript-header-right">
          <button className="stovo-transcript-action-btn" aria-label="Call options">
            <MoreVertical size={16} />
          </button>
        </div>
      </header>

      {/* Main 2-column bento body */}
      <main className="stovo-transcript-main">
        {/* Left Column: Audio scrubber & Live Transcript */}
        <section className="stovo-col-transcript">
          <div className="stovo-col-header">
            <div className="stovo-col-title">
              <Headphones size={14} className="stovo-accent-icon" />
              <span>Call Audio &amp; Transcript</span>
            </div>
            <span className="stovo-col-badge">Audio Synced</span>
          </div>

          {/* Interactive audio player card */}
          <div className="stovo-player-card">
            <div className="stovo-player-top">
              <button
                type="button"
                className={`stovo-play-btn ${isPlaying ? "playing" : ""}`}
                onClick={() => setIsPlaying(!isPlaying)}
                aria-label={isPlaying ? "Pause call audio" : "Play call audio"}
              >
                {isPlaying ? <Pause size={14} fill="#ffffff" /> : <Play size={14} fill="#ffffff" style={{ marginLeft: "2px" }} />}
              </button>
              <div className="stovo-player-time">
                <strong>{isPlaying ? "14:28" : "00:00"}</strong>
                <span>/ 38:14</span>
              </div>
              <div className="stovo-speaker-current">
                <span className="stovo-speaker-dot" />
                <span>Mira Chen speaking</span>
              </div>
            </div>

            {/* Audio waveform visualizer */}
            <div className="stovo-waveform-container" aria-hidden="true">
              {waveformHeights.map((h, i) => (
                <span
                  key={i}
                  className={`stovo-waveform-bar ${i < 12 ? "played" : ""} ${i === 11 ? "cursor" : ""}`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          {/* Transcript quotes stream */}
          <div className="stovo-quotes-stream">
            {/* Quote 1: Mira */}
            <article className={`stovo-quote-card ${activeSegment === 0 ? "highlighted" : ""}`}>
              <div className="stovo-quote-author">
                <img src="/avatars/user-mira.webp" alt="Mira Chen" className="stovo-author-avatar" />
                <div className="stovo-author-info">
                  <div className="stovo-author-row">
                    <strong>Mira Chen</strong>
                    <span className="stovo-author-role">Design Lead</span>
                  </div>
                  <span className="stovo-quote-time">14:28</span>
                </div>
                <span className="stovo-quote-topic-tag">Navigation</span>
              </div>
              <p className="stovo-quote-text">
                “We’ll keep the smaller navigation and move the final review to Thursday.”
              </p>
            </article>

            {/* Quote 2: Noah */}
            <article className={`stovo-quote-card ${activeSegment === 1 ? "highlighted" : ""}`}>
              <div className="stovo-quote-author">
                <img src="/avatars/user-noah.webp" alt="Noah Vance" className="stovo-author-avatar" />
                <div className="stovo-author-info">
                  <div className="stovo-author-row">
                    <strong>Noah Vance</strong>
                    <span className="stovo-author-role">Product</span>
                  </div>
                  <span className="stovo-quote-time">22:15</span>
                </div>
                <span className="stovo-quote-topic-tag">Files Vault</span>
              </div>
              <p className="stovo-quote-text">
                “The shared Files view will keep every supporting document in context.”
              </p>
            </article>
          </div>

          <div className="stovo-transcript-bottom-row">
            <button type="button" className="stovo-view-all-turns-btn">
              <span>View full transcript (142 turns)</span>
              <span className="stovo-turns-indicator">→</span>
            </button>
          </div>
        </section>

        {/* Right Column: AI Summary + Action Items + Granular MCP */}
        <section className="stovo-col-intelligence">
          {/* Call Summary Card */}
          <div className="stovo-card-summary">
            <div className="stovo-card-header">
              <div className="stovo-card-title">
                <Sparkles size={14} className="stovo-sparkle-coral" />
                <h3>Call summary</h3>
              </div>
              <span className="stovo-grounded-pill" aria-label="Grounded">
                <Check size={11} strokeWidth={2.5} />
              </span>
            </div>
            <p className="stovo-summary-body">
              Navigation direction is approved. The team will review the mobile states before launch.
            </p>
            <div className="stovo-decision-chips">
              <span className="stovo-decision-chip">
                <Check size={11} className="stovo-chip-check" /> Compact rail approved
              </span>
              <span className="stovo-decision-chip">
                <Check size={11} className="stovo-chip-check" /> Final review Thursday 11 AM
              </span>
            </div>
          </div>

          {/* Action Items Card */}
          <div className="stovo-card-actions">
            <div className="stovo-card-header">
              <div className="stovo-card-title">
                <CheckSquare size={14} className="stovo-action-icon" />
                <h4>Action items</h4>
              </div>
              <span className="stovo-actions-count">
                {completedCount} of {tasks.length} done
              </span>
            </div>

            <ul className="stovo-task-list">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className={`stovo-task-item ${task.done ? "task-completed" : ""}`}
                  onClick={() => toggleTask(task.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleTask(task.id);
                    }
                  }}
                >
                  <button
                    type="button"
                    className={`stovo-checkbox ${task.done ? "checked" : ""}`}
                    aria-label={task.done ? "Mark task incomplete" : "Mark task complete"}
                  >
                    {task.done && <Check size={11} strokeWidth={3} />}
                  </button>

                  <div className="stovo-task-content">
                    <span className="stovo-task-text">{task.text}</span>
                    <div className="stovo-task-meta">
                      <div className="stovo-assignee-pill">
                        <img src={task.avatar} alt={task.assignee} className="stovo-assignee-avatar" />
                        <span>{task.assignee}</span>
                      </div>
                      <span className="stovo-task-due">{task.due}</span>
                      <span className="stovo-task-tag">{task.tag}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Granular MCP Agent Access Card */}
          <div className="stovo-card-mcp">
            <div className="stovo-mcp-header">
              <div className="stovo-mcp-title">
                <Cpu size={13} className="stovo-mcp-icon" />
                <span>Granular MCP Agent Access</span>
              </div>
              <span className="stovo-mcp-badge">
                <span className="stovo-mcp-dot" /> Active
              </span>
            </div>
            <div className="stovo-mcp-integrations">
              <div className="stovo-mcp-pill">
                <span className="mcp-avatar linear">L</span>
                <div className="mcp-pill-text">
                  <strong>Linear MCP</strong>
                  <small>Exported 3 action items</small>
                </div>
                <span className="mcp-scope-badge">write:issues</span>
              </div>
              <div className="stovo-mcp-pill">
                <span className="mcp-avatar claude">C</span>
                <div className="mcp-pill-text">
                  <strong>Claude Workspace</strong>
                  <small>Indexed transcript context</small>
                </div>
                <span className="mcp-scope-badge">read:notes</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
