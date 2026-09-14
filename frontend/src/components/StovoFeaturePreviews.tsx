"use client";

import { useState } from "react";
import {
  Check,
  CheckSquare,
  FileText,
  Folder,
  Hash,
  Image as ImageIcon,
  LockKeyhole,
  Mic,
  MoreHorizontal,
  MessageCircle,
  MessageSquare,
  Search,
  Shield,
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
  return <div className="stovo-transcript-preview" aria-label="Stovo AI Notes preview">
    <header><img src="/avatars/chat-design.webp" alt="Design review" className="stovo-space-avatar" /><div><strong>Design review</strong><small>4 members · Call ended</small></div><MoreHorizontal size={18} /></header>
    <main>
      <div className="stovo-call-status"><span className="stovo-feature-dot" /> AI Notes ready <small>Generated from this call</small></div>
      <section className="stovo-transcript-card"><div><strong>AI Transcript</strong><span>38 min</span></div><p>“We’ll keep the smaller navigation and move the final review to Thursday.”</p><p className="stovo-transcript-quote">“The shared Files view will keep every supporting document in context.”</p><button>View transcript</button></section>
      <section className="stovo-notes-card"><h3>Call summary</h3><p>Navigation direction is approved. The team will review the mobile states before launch.</p><h4>Action items</h4><ul><li><Check size={14} /> Mira: share mobile screens</li><li><Check size={14} /> Noah: schedule final review</li><li><Check size={14} /> Ivan: publish the notes</li></ul></section>
    </main>
    <footer><span><Users size={15} /> Posted in Design review</span><span>Private to this chat</span></footer>
  </div>;
}
