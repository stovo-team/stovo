"use client";

import { useState } from "react";
import { useStrings } from "../i18n/LanguageContext";
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
  const copy = useStrings().previews;
  if (kind === "voice") {
    const people = [
      { name: copy.alex, role: copy.speaking, avatar: "/avatars/user-alex.webp", active: true },
      { name: copy.mira, role: copy.listening, avatar: "/avatars/user-mira.webp", active: false },
      { name: copy.noah, role: copy.muted, avatar: "/avatars/user-noah.webp", active: false },
    ];
    return (
      <div className="stovo-feature-preview stovo-voice-preview" aria-label={copy.voicePreview}>
        <header>
          <span className="stovo-feature-dot" />
          <strong>{copy.raidPlanning}</strong>
          <small>{copy.voiceChannel}</small>
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
          <button aria-label={copy.muteMicrophone}><Mic size={15} /></button>
          <button aria-label={copy.startCamera}><Video size={15} /></button>
          <button className="hangup">{copy.leave}</button>
        </footer>
      </div>
    );
  }

  if (kind === "files") {
    return (
      <div className="stovo-feature-preview stovo-files-mini" aria-label={copy.storagePreview}>
        <header>
          <strong>{copy.storage}</strong>
          <span>{copy.familySpace}</span>
          <button>{copy.upload}</button>
        </header>
        <div className="stovo-files-mini-grid">
          <article className="photo has-thumb">
            <div className="stovo-file-thumb-container">
              <img src="/avatars/album-weekend.webp" alt={copy.weekend} className="stovo-file-thumb" />
            </div>
            <b>{copy.weekend}</b>
            <small>{copy.photoCount}</small>
          </article>
          <article className="document">
            <FileText size={21} />
            <b>{copy.schoolForms}</b>
            <small>PDF</small>
          </article>
          <article className="folder">
            <Folder size={21} />
            <b>{copy.documents}</b>
            <small>{copy.fileCount}</small>
          </article>
        </div>
      </div>
    );
  }

  const workspaceChats = [
    {
      name: copy.general,
      meta: copy.memberCount,
      avatar: "/avatars/chat-general.webp",
      active: false,
    },
    {
      name: copy.designReview,
      meta: copy.sharedLatestDraft,
      avatar: "/avatars/chat-design.webp",
      active: true,
    },
    {
      name: copy.launchChecklist,
      meta: copy.newMessages,
      avatar: "/avatars/chat-launch.webp",
      badge: 2,
      active: false,
    },
  ];

  return (
    <div className="stovo-feature-preview stovo-workspace-mini" aria-label={copy.workspacePreview}>
      <header>
        <img src="/avatars/studio.webp" alt={copy.studio} className="stovo-space-avatar" />
        <strong>{copy.studio}</strong>
        <span className="stovo-online">{copy.onlineCount}</span>
      </header>
      <label>
        <Search size={14} />
        <span>{copy.searchChats}</span>
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
  const copy = useStrings().previews;
  const [activeTab, setActiveTab] = useState<"all" | "docs" | "canvas">("all");
  const [selectedSource, setSelectedSource] = useState<"engineering" | "all" | "vault">("engineering");

  return (
    <div className="stovo-storage-preview-window" aria-label={copy.storageWindow}>
      {/* Top window chrome */}
      <div className="storage-preview-titlebar">
        <div className="storage-preview-dots">
          <span className="dot dot-red" />
          <span className="dot dot-amber" />
          <span className="dot dot-green" />
          <span className="storage-preview-path">{copy.storagePath}</span>
        </div>
        <div className="storage-preview-status-tags">
          <span className="tag-s3">{copy.minioOnline}</span>
          <span className="tag-vault">{copy.encryptedVault}</span>
        </div>
      </div>

      {/* Split body: Sources sidebar + Main files area */}
      <div className="storage-preview-body">
        {/* Left sources sidebar */}
        <aside className="storage-preview-sidebar">
          <div className="sidebar-group">
            <span className="sidebar-label">{copy.connectedChats}</span>
            <button
              type="button"
              className={`sidebar-item ${selectedSource === "engineering" ? "active" : ""}`}
              onClick={() => setSelectedSource("engineering")}
            >
              <Hash size={13} className="item-icon channel-hash" />
              <div className="item-meta">
                <strong>#engineering</strong>
                <small>{copy.sharedFiles}</small>
              </div>
            </button>
            <button
              type="button"
              className={`sidebar-item ${selectedSource === "all" ? "active" : ""}`}
              onClick={() => setSelectedSource("all")}
            >
              <MessageSquare size={13} className="item-icon" />
              <div className="item-meta">
                <strong>{copy.allConversations}</strong>
                <small>{copy.totalFiles}</small>
              </div>
            </button>
          </div>

          <div className="sidebar-group">
            <span className="sidebar-label">{copy.vaultFolders}</span>
            <button
              type="button"
              className={`sidebar-item ${selectedSource === "vault" ? "active" : ""}`}
              onClick={() => setSelectedSource("vault")}
            >
              <Folder size={13} className="item-icon folder-gold" />
              <div className="item-meta">
                <strong>/Projects/Docs</strong>
                <small>{copy.syncedVault}</small>
              </div>
            </button>
          </div>

          <div className="sidebar-quota-box">
            <div className="quota-row">
              <span>{copy.s3Quota}</span>
              <strong>{copy.quota}</strong>
            </div>
            <div className="quota-bar-track">
              <div className="quota-bar-fill" style={{ width: "35%" }} />
            </div>
            <small>{copy.minioCluster}</small>
          </div>
        </aside>

        {/* Main files content */}
        <main className="storage-preview-main">
          {/* Connected message origin banner */}
          <div className="storage-chat-origin-card">
            <div className="origin-avatar">AK</div>
            <div className="origin-copy">
              <div className="origin-header">
                <strong>{copy.alexKim}</strong>
                <span className="origin-channel">{copy.inEngineering}</span>
                <time>{copy.messageTime}</time>
              </div>
              <p>{copy.attachedMessage}</p>
            </div>
            <span className="origin-sync-badge">
              <Check size={11} /> {copy.autoSaved}
            </span>
          </div>

          {/* Search and filters toolbar */}
          <div className="storage-preview-toolbar">
            <label className="storage-preview-search">
              <Search size={14} />
              <input placeholder={copy.searchEngineeringFiles} readOnly />
            </label>
            <div className="storage-preview-filters">
              <button
                type="button"
                className={activeTab === "all" ? "active" : ""}
                onClick={() => setActiveTab("all")}
              >
                {copy.allCount}
              </button>
              <button
                type="button"
                className={activeTab === "docs" ? "active" : ""}
                onClick={() => setActiveTab("docs")}
              >
                {copy.documentsCount}
              </button>
              <button
                type="button"
                className={activeTab === "canvas" ? "active" : ""}
                onClick={() => setActiveTab("canvas")}
              >
                {copy.canvasesCount}
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
                    <Shield size={10} /> {copy.synced}
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
                  <strong>{copy.architecturePdf}</strong>
                  <div className="tile-meta-row">
                    <span>{copy.architectureMeta}</span>
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
                    <Check size={10} /> {copy.live}
                  </span>
                </div>

                {/* The canvas board layout preview - matching hero demo */}
                <div className="stovo-canvas-board-viewport">
                  <div className="stovo-canvas-mini-node node-indigo">
                    <b>{copy.releaseGate}</b>
                    <p>{copy.securityVerified}</p>
                  </div>
                  <div className="stovo-canvas-mini-node node-cyan">
                    <b>{copy.telemetry}</b>
                    <p>{copy.syncPercentage}</p>
                  </div>
                  <div className="stovo-canvas-mini-node node-emerald">
                    <b>{copy.clientAudit}</b>
                    <p>{copy.euResidency}</p>
                  </div>
                </div>

                <div className="tile-footer-info">
                  <strong>{copy.launchCanvas}</strong>
                  <div className="tile-meta-row">
                    <span>{copy.canvasMeta}</span>
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
                    <Shield size={10} /> {copy.synced}
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
                  <strong>{copy.auditPdf}</strong>
                  <div className="tile-meta-row">
                    <span>{copy.auditMeta}</span>
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
              <span>{copy.encryptedFiles}</span>
            </span>
            <span className="footer-right">{copy.localMinio}</span>
          </div>
        </main>
      </div>
    </div>
  );
}

export function TranscriptPreview() {
  const copy = useStrings().previews;
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSegment, setActiveSegment] = useState<number>(0);
  const [tasks, setTasks] = useState([
    {
      id: 1,
      text: copy.shareScreens,
      assignee: copy.miraChen,
      role: copy.designLead,
      avatar: "/avatars/user-mira.webp",
      done: true,
      tag: copy.linearTag,
      due: copy.transcriptTasks[0].due,
    },
    {
      id: 2,
      text: copy.scheduleReview,
      assignee: copy.noahVance,
      role: copy.productLead,
      avatar: "/avatars/user-noah.webp",
      done: false,
      tag: copy.calendarTag,
      due: copy.transcriptTasks[1].due,
    },
    {
      id: 3,
      text: copy.publishNotes,
      assignee: copy.ivan,
      role: copy.coreTeam,
      avatar: "/avatars/user-alex.webp",
      done: false,
      tag: copy.vaultTag,
      due: copy.transcriptTasks[2].due,
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
    <div className="stovo-transcript-preview" aria-label={copy.aiNotesPreview}>
      {/* Header bar */}
      <header className="stovo-transcript-header">
        <div className="stovo-transcript-header-left">
          <img src="/avatars/chat-design.webp" alt={copy.designReview} className="stovo-transcript-avatar" />
          <div className="stovo-transcript-header-meta">
            <div className="stovo-transcript-header-title-row">
              <strong>{copy.designReview}</strong>
              <span className="stovo-call-ended-pill">{copy.callEnded}</span>
            </div>
            <div className="stovo-transcript-header-sub">
              <span className="stovo-attendee-count">{copy.participantCount}</span>
              <div className="stovo-participants-stack">
                <img src="/avatars/user-mira.webp" alt={copy.mira} title={copy.miraChen} />
                <img src="/avatars/user-noah.webp" alt={copy.noah} title={copy.noahVance} />
                <img src="/avatars/user-alex.webp" alt={copy.alex} title={copy.alexKim} />
                <span className="stovo-participant-bubble" title={copy.ivan}>IV</span>
              </div>
            </div>
          </div>
        </div>

        <div className="stovo-transcript-header-right">
          <button className="stovo-transcript-action-btn" aria-label={copy.callOptions}>
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
              <span>{copy.callAudioTranscript}</span>
            </div>
            <span className="stovo-col-badge">{copy.audioSynced}</span>
          </div>

          {/* Interactive audio player card */}
          <div className="stovo-player-card">
            <div className="stovo-player-top">
              <button
                type="button"
                className={`stovo-play-btn ${isPlaying ? "playing" : ""}`}
                onClick={() => setIsPlaying(!isPlaying)}
                aria-label={isPlaying ? copy.pauseCallAudio : copy.playCallAudio}
              >
                {isPlaying ? <Pause size={14} fill="var(--color-palette-f2074b6cef37)" /> : <Play size={14} fill="var(--color-palette-f2074b6cef37)" style={{ marginLeft: "2px" }} />}
              </button>
              <div className="stovo-player-time">
                <strong>{isPlaying ? "14:28" : "00:00"}</strong>
                <span>/ 38:14</span>
              </div>
              <div className="stovo-speaker-current">
                <span className="stovo-speaker-dot" />
                <span>{copy.miraSpeaking}</span>
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
                <img src="/avatars/user-mira.webp" alt={copy.miraChen} className="stovo-author-avatar" />
                <div className="stovo-author-info">
                  <div className="stovo-author-row">
                    <strong>{copy.miraChen}</strong>
                    <span className="stovo-author-role">{copy.designLead}</span>
                  </div>
                  <span className="stovo-quote-time">14:28</span>
                </div>
                <span className="stovo-quote-topic-tag">{copy.navigation}</span>
              </div>
              <p className="stovo-quote-text">
                {copy.navigationQuote}
              </p>
            </article>

            {/* Quote 2: Noah */}
            <article className={`stovo-quote-card ${activeSegment === 1 ? "highlighted" : ""}`}>
              <div className="stovo-quote-author">
                <img src="/avatars/user-noah.webp" alt={copy.noahVance} className="stovo-author-avatar" />
                <div className="stovo-author-info">
                  <div className="stovo-author-row">
                    <strong>{copy.noahVance}</strong>
                    <span className="stovo-author-role">{copy.product}</span>
                  </div>
                  <span className="stovo-quote-time">22:15</span>
                </div>
                <span className="stovo-quote-topic-tag">{copy.filesVault}</span>
              </div>
              <p className="stovo-quote-text">
                {copy.filesQuote}
              </p>
            </article>
          </div>

          <div className="stovo-transcript-bottom-row">
            <button type="button" className="stovo-view-all-turns-btn">
              <span>{copy.fullTranscript}</span>
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
                <h3>{copy.callSummary}</h3>
              </div>
              <span className="stovo-grounded-pill" aria-label={copy.grounded}>
                <Check size={11} strokeWidth={2.5} />
              </span>
            </div>
            <p className="stovo-summary-body">
              {copy.summary}
            </p>
            <div className="stovo-decision-chips">
              <span className="stovo-decision-chip">
                <Check size={11} className="stovo-chip-check" /> {copy.compactRailApproved}
              </span>
              <span className="stovo-decision-chip">
                <Check size={11} className="stovo-chip-check" /> {copy.finalReview}
              </span>
            </div>
          </div>

          {/* Action Items Card */}
          <div className="stovo-card-actions">
            <div className="stovo-card-header">
              <div className="stovo-card-title">
                <CheckSquare size={14} className="stovo-action-icon" />
                <h4>{copy.actionItems}</h4>
              </div>
              <span className="stovo-actions-count">
                {copy.completedOf(completedCount, tasks.length)}
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
                    aria-label={task.done ? copy.markIncomplete : copy.markComplete}
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
                <span>{copy.granularMcpAccess}</span>
              </div>
              <span className="stovo-mcp-badge">
                <span className="stovo-mcp-dot" /> {copy.active}
              </span>
            </div>
            <div className="stovo-mcp-integrations">
              <div className="stovo-mcp-pill">
                <span className="mcp-avatar linear">L</span>
                <div className="mcp-pill-text">
                  <strong>{copy.linearMcp}</strong>
                  <small>{copy.exportedActions}</small>
                </div>
                <span className="mcp-scope-badge">write:issues</span>
              </div>
              <div className="stovo-mcp-pill">
                <span className="mcp-avatar claude">C</span>
                <div className="mcp-pill-text">
                  <strong>{copy.claudeWorkspace}</strong>
                  <small>{copy.indexedTranscript}</small>
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
