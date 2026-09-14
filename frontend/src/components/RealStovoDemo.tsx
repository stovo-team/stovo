"use client";

import { useState, useEffect, useRef } from "react";
import {
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FileType,
  Folder,
  Hash,
  Link2,
  LockKeyhole,
  LogOut,
  Megaphone,
  MessageCircle,
  ArrowUp,
  Paperclip,
  Phone,
  Plus,
  Radio,
  Search,
  Settings,
  Smile,
  StickyNote,
  UserPlus,
  UsersRound,
  Video,
  Volume2,
} from "lucide-react";
import StovoLogo from "./StovoLogo";

type Attachment =
  | {
      type: "document";
      title: string;
      detail: string;
      docType: "pdf" | "docx" | "table";
      pages?: number;
    }
  | {
      type: "canvas";
      title: string;
      detail: string;
      cardsCount: number;
      collaborators: number;
    }
  | {
      type: "folder";
      title: string;
      detail: string;
      fileCount: number;
    }
  | {
      type: "link";
      title: string;
      url: string;
      domain: string;
      siteName: string;
      description: string;
      ogTag?: string;
    };

type PreviewMessage = {
  id: string;
  sender: string;
  initials: string;
  tone: "blue" | "violet" | "green" | "amber";
  text: string;
  time: string;
  attachment?: Attachment;
};

type Chat = {
  id: string;
  section: string;
  name: string;
  preview: string;
  time: string;
  type: "group" | "direct" | "channel" | "voice";
  members?: number;
  subscribers?: number;
  voiceInfo?: string;
  disabled?: boolean;
  avatarBg: string;
  avatarText?: string;
  avatarImage?: string;
  avatarIcon?: "megaphone" | "hash" | "voice";
  messages: PreviewMessage[];
};

const SENDER_AVATARS: Record<string, string> = {
  "Priya Shah": "/avatars/user-mira.webp",
  "Alex Chen": "/avatars/user-alex.webp",
  "Maya Ortiz": "/avatars/user-elena.webp",
  "Jon Bell": "/avatars/user-noah.webp",
  "Nora Vance": "/avatars/user-elena.webp",
  "Nathan Vance": "/avatars/user-marcus.webp",
  "You": "/avatars/user-marcus.webp",
};

const chats: Chat[] = [
  {
    id: "launch",
    section: "Product",
    name: "Launch Room",
    preview: "Jon: Implementation checklist linked",
    time: "10:36",
    type: "group",
    members: 18,
    avatarBg: "#3b82f6",
    avatarText: "LR",
    avatarImage: "/avatars/chat-launch-room.webp",
    messages: [
      {
        id: "launch-1",
        sender: "Priya Shah",
        initials: "PS",
        tone: "violet",
        text: "I consolidated the launch feedback and updated the customer rollout section for review.",
        time: "09:42",
        attachment: {
          type: "document",
          title: "Q3-launch-brief.pdf",
          detail: "PDF · 2.4 MB · 12 pages",
          docType: "pdf",
          pages: 12,
        },
      },
      {
        id: "launch-2",
        sender: "Alex Chen",
        initials: "AC",
        tone: "blue",
        text: "The decision log and open owners are in the launch canvas. Please add any blockers before the afternoon check-in.",
        time: "09:57",
        attachment: {
          type: "canvas",
          title: "Launch readiness.canvas",
          detail: "Canvas · 18 cards · 6 collaborators",
          cardsCount: 18,
          collaborators: 6,
        },
      },
      {
        id: "launch-3",
        sender: "You",
        initials: "YO",
        tone: "blue",
        text: "Staging deployment passed all automated end-to-end assertions. Telemetry pipelines and logging are verified for Thursday.",
        time: "10:12",
      },
      {
        id: "launch-4",
        sender: "Maya Ortiz",
        initials: "MO",
        tone: "green",
        text: "Client-facing assets are approved. I moved the final versions into the shared delivery folder.",
        time: "10:20",
        attachment: {
          type: "folder",
          title: "Q3 Launch / Client materials",
          detail: "Folder · 12 files · Updated just now",
          fileCount: 12,
        },
      },
      {
        id: "launch-5",
        sender: "Jon Bell",
        initials: "JB",
        tone: "amber",
        text: "The implementation checklist is linked to the release plan and signed-off scope.",
        time: "10:36",
        attachment: {
          type: "link",
          title: "Release plan · Q3 Launch Milestone",
          url: "https://stovo.team/plans/release-q3",
          domain: "stovo.team",
          siteName: "Stovo Plans",
          description:
            "Automated dependency graph, rollout phases, and critical path owner checklist.",
          ogTag: "Release Milestone · Staging Confirmed",
        },
      },
    ],
  },
  {
    id: "allhands",
    section: "Company",
    name: "All-hands",
    preview: "Jon: Added recording and decisions",
    time: "10:42",
    type: "group",
    members: 42,
    avatarBg: "#6366f1",
    avatarText: "AH",
    avatarImage: "/avatars/chat-allhands.webp",
    messages: [
      {
        id: "allhands-1",
        sender: "Maya Ortiz",
        initials: "MO",
        tone: "green",
        text: "The September board update is ready. Please review your team metrics before Friday's all-hands.",
        time: "10:04",
        attachment: {
          type: "document",
          title: "September board update.pdf",
          detail: "PDF · 18 pages · 4.2 MB",
          docType: "pdf",
          pages: 18,
        },
      },
      {
        id: "allhands-2",
        sender: "You",
        initials: "YO",
        tone: "blue",
        text: "Added the Q3 latency benchmarks to slide 8. Sync performance is up 38% across distributed regions.",
        time: "10:22",
      },
      {
        id: "allhands-3",
        sender: "Jon Bell",
        initials: "JB",
        tone: "amber",
        text: "I added the recording and decisions from this morning's leadership review.",
        time: "10:42",
        attachment: {
          type: "link",
          title: "Leadership review · notes & recording",
          url: "https://stovo.team/leadership-review",
          domain: "stovo.team",
          siteName: "Stovo Notes",
          description:
            "Quarterly strategy alignment, hiring approvals, and infrastructure investments overview.",
          ogTag: "Executive Review · 48m",
        },
      },
    ],
  },
  {
    id: "announcements",
    section: "Company",
    name: "announcements",
    preview: "Maya: Stovo 2.4 release notes published",
    time: "09:15",
    type: "channel",
    subscribers: 42,
    avatarBg: "#8b5cf6",
    avatarIcon: "megaphone",
    messages: [
      {
        id: "ann-1",
        sender: "Maya Ortiz",
        initials: "MO",
        tone: "violet",
        text: "🚀 Stovo 2.4 has rolled out to all production clusters. Local replica SQLite sync and end-to-end encrypted vaults are live.",
        time: "09:15",
        attachment: {
          type: "document",
          title: "Stovo-2.4-Changelog.pdf",
          detail: "PDF · 3 pages · 1.1 MB",
          docType: "pdf",
          pages: 3,
        },
      },
      {
        id: "ann-2",
        sender: "You",
        initials: "YO",
        tone: "blue",
        text: "All enterprise nodes updated with zero downtime. Verified active replica delta streams.",
        time: "09:28",
      },
    ],
  },
  {
    id: "town-hall-voice",
    section: "Company",
    name: "Town Hall Voice",
    preview: "Voice channel · 3 active",
    time: "Live",
    type: "voice",
    voiceInfo: "3 active",
    disabled: true,
    avatarBg: "#10b981",
    avatarIcon: "voice",
    messages: [],
  },
  {
    id: "atlas",
    section: "Client Delivery",
    name: "Atlas · Implementation",
    preview: "Priya: Account plan updated",
    time: "Yesterday",
    type: "group",
    members: 11,
    avatarBg: "#0d9488",
    avatarText: "AT",
    avatarImage: "/avatars/chat-team-alpha.webp",
    messages: [
      {
        id: "atlas-1",
        sender: "Maya Ortiz",
        initials: "MO",
        tone: "green",
        text: "Atlas moved their implementation review to Thursday. The latest integration documents are ready for their team.",
        time: "Yesterday",
        attachment: {
          type: "folder",
          title: "Atlas / Implementation review",
          detail: "Folder · 16 files · External sharing enabled",
          fileCount: 16,
        },
      },
      {
        id: "atlas-2",
        sender: "You",
        initials: "YO",
        tone: "blue",
        text: "I regenerated their dedicated staging tenant credentials and shared the webhook signing keys.",
        time: "Yesterday",
      },
      {
        id: "atlas-3",
        sender: "Priya Shah",
        initials: "PS",
        tone: "violet",
        text: "The account plan now reflects the revised stakeholder timeline and training milestones.",
        time: "Yesterday",
        attachment: {
          type: "link",
          title: "Atlas Enterprise Implementation Plan",
          url: "https://stovo.team/atlas-plan",
          domain: "stovo.team",
          siteName: "Stovo Docs",
          description:
            "Phase 1 migration roadmap, data residency guarantees, and dedicated SLA matrix.",
          ogTag: "Enterprise SLA · 99.99%",
        },
      },
    ],
  },
  {
    id: "acme",
    section: "Client Delivery",
    name: "Acme Corp · Rollout",
    preview: "Nora: SLA report submitted",
    time: "Sep 11",
    type: "group",
    members: 9,
    avatarBg: "#f59e0b",
    avatarText: "AC",
    avatarImage: "/avatars/chat-architecture.webp",
    messages: [
      {
        id: "acme-1",
        sender: "Nora Vance",
        initials: "NV",
        tone: "amber",
        text: "Acme signed off on phase 1 migration. All 240 employee seats are provisioned and active on private bare metal.",
        time: "Sep 11",
        attachment: {
          type: "document",
          title: "Acme-Phase1-Signoff.pdf",
          detail: "PDF · 6 pages · Signed & Verified",
          docType: "pdf",
          pages: 6,
        },
      },
      {
        id: "acme-2",
        sender: "You",
        initials: "YO",
        tone: "blue",
        text: "Telemetry dashboard shows average message delivery at 8ms. No packet drops detected.",
        time: "Sep 11",
      },
    ],
  },
  {
    id: "client-huddle",
    section: "Client Delivery",
    name: "Client Huddle",
    preview: "Voice room · Restricted",
    time: "Voice",
    type: "voice",
    voiceInfo: "Voice room",
    disabled: true,
    avatarBg: "#059669",
    avatarIcon: "voice",
    messages: [],
  },
];

const rotatableChatIds = ["launch", "allhands", "announcements", "atlas", "acme"];

export default function RealStovoDemo() {
  const [activeScreen, setActiveScreen] = useState<"chats" | "files" | "plans">("chats");
  const [selectedId, setSelectedId] = useState("launch");
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<Record<string, PreviewMessage[]>>({});
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userInteractionTimeout = useRef<NodeJS.Timeout | null>(null);

  const selected = chats.find((chat) => chat.id === selectedId) ?? chats[0];

  // Pause auto-rotation when user clicks or types, resume after inactivity
  const handleUserActivity = () => {
    setIsAutoRotating(false);
    if (userInteractionTimeout.current) {
      clearTimeout(userInteractionTimeout.current);
    }
    userInteractionTimeout.current = setTimeout(() => {
      setIsAutoRotating(true);
    }, 18000);
  };

  // Automatic chat switcher animation
  useEffect(() => {
    if (!isAutoRotating || activeScreen !== "chats") return;

    const interval = setInterval(() => {
      setSelectedId((currentId) => {
        const currentIndex = rotatableChatIds.indexOf(currentId);
        const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % rotatableChatIds.length;
        return rotatableChatIds[nextIndex];
      });
    }, 7000);

    return () => clearInterval(interval);
  }, [isAutoRotating, activeScreen]);

  const submit = () => {
    const message = draft.trim();
    if (!message) return;
    handleUserActivity();
    setSent((messagesByChat) => ({
      ...messagesByChat,
      [selectedId]: [
        ...(messagesByChat[selectedId] ?? []),
        {
          id: `draft-${selectedId}-${Date.now()}`,
          sender: "You",
          initials: "YO",
          tone: "blue",
          text: message,
          time: "Now",
        },
      ],
    }));
    setDraft("");
  };

  return (
    <section className="stovo-source-snapshot" aria-label="Stovo corporate workspace preview">
      <div className="stovo-source-shell">
        {/* Leftmost app navigation bar (Real Stovo AppNav) */}
        <nav className="stovo-source-nav" aria-label="Stovo navigation">
          <div className="stovo-source-nav-links">
            <button
              type="button"
              className={activeScreen === "chats" ? "active" : ""}
              aria-label="Chats"
              onClick={() => {
                setActiveScreen("chats");
                handleUserActivity();
              }}
            >
              <MessageCircle />
              <span>Chats</span>
            </button>
            <button
              type="button"
              className={activeScreen === "files" ? "active" : ""}
              aria-label="Files"
              onClick={() => {
                setActiveScreen("files");
                handleUserActivity();
              }}
            >
              <Folder />
              <span>Files</span>
            </button>
            <button
              type="button"
              className={activeScreen === "plans" ? "active" : ""}
              aria-label="Plans"
              onClick={() => {
                setActiveScreen("plans");
                handleUserActivity();
              }}
            >
              <CalendarDays />
              <span>Plans</span>
            </button>
            <button
              type="button"
              className="stovo-nav-disabled"
              aria-label="Settings"
              title="Settings (read-only preview)"
              disabled
            >
              <Settings />
              <span>Settings</span>
            </button>
          </div>
          <button
            type="button"
            className="stovo-source-logout stovo-nav-disabled"
            aria-label="Log out"
            title="Log out (read-only preview)"
            disabled
          >
            <LogOut />
            <span>Log out</span>
          </button>
        </nav>

        {/* Main interactive surface */}
        <section className="stovo-source-workspace">
          <div className="stovo-source-layout">
            {/* Chats sidebar */}
            <aside className="stovo-source-sidebar" aria-label="Chats sidebar">
              <div className="stovo-source-sidebar-header">
                <div className="stovo-source-title-row">
                  <span className="stovo-source-brand">
                    <StovoLogo size={40} />
                  </span>
                  <button className="stovo-source-space" aria-label="Select space">
                    Stovo Team <ChevronDown size={14} />
                  </button>
                  <button className="stovo-source-invite" aria-label="Invite members">
                    <UserPlus size={17} />
                  </button>
                </div>
                <label className="stovo-source-search">
                  <Search size={16} />
                  <input placeholder="Search messages or members" readOnly />
                </label>
                <div className="stovo-source-filters">
                  <button type="button" className="active">All</button>
                  <button type="button">Unread</button>
                  <button type="button">Groups</button>
                  <button type="button">Direct</button>
                </div>
              </div>

              <div className="stovo-source-list" role="list">
                {chats.map((chat, index) => {
                  const isFirstInSection = index === 0 || chats[index - 1].section !== chat.section;
                  const isSelected = activeScreen === "chats" && selectedId === chat.id;

                  return (
                    <div className="stovo-source-section" key={chat.id}>
                      {isFirstInSection && (
                        <h3>
                          <Folder size={12} /> {chat.section}
                          <small>
                            {chats.filter((item) => item.section === chat.section).length}
                          </small>
                        </h3>
                      )}
                      <button
                        type="button"
                        className={`stovo-source-chat ${isSelected ? "active" : ""} ${
                          chat.disabled ? "is-disabled" : ""
                        }`}
                        onClick={() => {
                          if (!chat.disabled) {
                            setSelectedId(chat.id);
                            setActiveScreen("chats");
                            handleUserActivity();
                          }
                        }}
                        aria-selected={isSelected}
                      >
                        <ChatAvatar chat={chat} />
                        <span className="stovo-source-chat-copy">
                          <span>
                            <strong>
                              {chat.type === "channel" ? `# ${chat.name}` : chat.name}
                            </strong>
                            <time>{chat.time}</time>
                          </span>
                          {chat.preview && (
                            <small className={chat.type === "voice" ? "voice-preview-meta" : ""}>
                              {chat.preview}
                            </small>
                          )}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </aside>

            {/* Main conversation or alternate screen */}
            {activeScreen === "chats" ? (
              <main className="stovo-source-conversation">
                {/* Fully rounded floating header */}
                <header className="stovo-source-chat-header">
                  <ChatAvatar chat={selected} size="small" />
                  <span className="stovo-source-channel-info">
                    <strong>
                      {selected.type === "channel" ? `# ${selected.name}` : selected.name}
                    </strong>
                    <small>
                      {selected.members
                        ? `${selected.members} members`
                        : selected.subscribers
                        ? `${selected.subscribers} subscribers`
                        : "Active conversation"}
                    </small>
                  </span>
                  <div className="stovo-source-header-actions">
                    <button
                      type="button"
                      className="stovo-header-icon-btn"
                      aria-label="Start audio call"
                      title="Audio call"
                      disabled
                    >
                      <Phone size={16} />
                    </button>
                    <button
                      type="button"
                      className="stovo-header-icon-btn"
                      aria-label="Start video call"
                      title="Video call"
                      disabled
                    >
                      <Video size={16} />
                    </button>
                    <button
                      type="button"
                      className="stovo-header-icon-btn"
                      aria-label="Search conversation"
                      title="Search"
                      disabled
                    >
                      <Search size={16} />
                    </button>
                    <button
                      type="button"
                      className="stovo-header-icon-btn"
                      aria-label="Conversation details"
                      title="Details"
                      disabled
                    >
                      <UsersRound size={16} />
                    </button>
                  </div>
                </header>

                {/* Message feed with scrolling */}
                <div
                  className="stovo-source-messages"
                  onWheel={handleUserActivity}
                  onTouchStart={handleUserActivity}
                >
                  <span className="stovo-source-day">Today · Monday, September 14</span>
                  {[...selected.messages, ...(sent[selectedId] ?? [])].map((message) => {
                    const isOutgoing = message.sender === "You";

                    return (
                      <article
                        className={`stovo-source-message ${isOutgoing ? "outgoing" : ""}`}
                        key={message.id}
                      >
                        {!isOutgoing && (() => {
                          const imgSrc = SENDER_AVATARS[message.sender];
                          return imgSrc ? (
                            <span className={`stovo-source-message-avatar ${message.tone}`} style={{ overflow: "hidden", padding: 0 }}>
                              <img src={imgSrc} alt={message.sender} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                            </span>
                          ) : (
                            <span className={`stovo-source-message-avatar ${message.tone}`}>
                              {message.initials}
                            </span>
                          );
                        })()}
                        <div className="stovo-source-message-content">
                          <header>
                            <strong>{message.sender}</strong>
                            <time>{message.time}</time>
                            {isOutgoing && <CheckCheck size={13} className="stovo-read-check" />}
                          </header>
                          <p>{message.text}</p>

                          {/* Embedded rich attachments */}
                          {message.attachment && (
                            <div className="stovo-attachment-wrapper">
                              {message.attachment.type === "document" && (
                                <DocumentEmbedCard attachment={message.attachment} />
                              )}
                              {message.attachment.type === "canvas" && (
                                <CanvasEmbedCard attachment={message.attachment} />
                              )}
                              {message.attachment.type === "link" && (
                                <LinkOgUnfurlCard attachment={message.attachment} />
                              )}
                              {message.attachment.type === "folder" && (
                                <FolderEmbedCard attachment={message.attachment} />
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Fully rounded composer with send button */}
                <form
                  className="stovo-source-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                  }}
                >
                  <button type="button" className="stovo-composer-tool" aria-label="Add attachment">
                    <Paperclip size={19} />
                  </button>
                  <button type="button" className="stovo-composer-tool" aria-label="Add emoji">
                    <Smile size={19} />
                  </button>
                  <input
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      handleUserActivity();
                    }}
                    placeholder={`Message ${selected.type === "channel" ? `#${selected.name}` : selected.name}`}
                  />
                  <button type="submit" aria-label="Send message" className="stovo-send-btn">
                    <ArrowUp size={16} strokeWidth={2.5} />
                  </button>
                </form>
              </main>
            ) : activeScreen === "files" ? (
              <FilesScreen />
            ) : (
              <PlansScreen />
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Avatar Component
// ----------------------------------------------------------------------------
function ChatAvatar({ chat, size = "normal" }: { chat: Chat; size?: "normal" | "small" }) {
  const sizeClass = size === "small" ? "stovo-avatar-small" : "";
  const px = size === "small" ? 15 : 18;

  // Image override — shown when the chat has a generated image avatar
  if (chat.avatarImage) {
    return (
      <span
        className={`stovo-source-avatar ${sizeClass}`}
        style={{ backgroundColor: chat.avatarBg, overflow: "hidden", padding: 0 }}
      >
        <img
          src={chat.avatarImage}
          alt={chat.name}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
        />
      </span>
    );
  }

  if (chat.avatarIcon === "megaphone") {
    return (
      <span
        className={`stovo-source-avatar channel-avatar ${sizeClass}`}
        style={{ backgroundColor: chat.avatarBg }}
      >
        <Megaphone size={px} />
      </span>
    );
  }

  if (chat.avatarIcon === "voice") {
    return (
      <span
        className={`stovo-source-avatar voice-avatar ${sizeClass}`}
        style={{ backgroundColor: chat.avatarBg }}
      >
        <Volume2 size={px} />
        <span className="voice-live-dot" />
      </span>
    );
  }

  return (
    <span
      className={`stovo-source-avatar ${sizeClass}`}
      style={{ backgroundColor: chat.avatarBg }}
    >
      {chat.avatarText || chat.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Embedded Document Preview (Matching Stovo DocumentAttachmentPreview)
// ----------------------------------------------------------------------------
function DocumentEmbedCard({
  attachment,
}: {
  attachment: Extract<Attachment, { type: "document" }>;
}) {
  return (
    <div className="stovo-doc-embed-card" data-doc-kind={attachment.docType}>
      <div className="stovo-doc-embed-header">
        <span className="stovo-doc-icon-badge">
          {attachment.docType === "table" ? (
            <FileSpreadsheet size={16} />
          ) : attachment.docType === "docx" ? (
            <FileType size={16} />
          ) : (
            <FileText size={16} />
          )}
        </span>
        <div className="stovo-doc-info">
          <strong>{attachment.title}</strong>
          <span>{attachment.detail}</span>
        </div>
        <button type="button" className="stovo-doc-open-btn">
          Open
        </button>
      </div>
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
    </div>
  );
}

// ----------------------------------------------------------------------------
// Embedded Canvas Preview (Matching Stovo CanvasTilePreview)
// ----------------------------------------------------------------------------
function CanvasEmbedCard({
  attachment,
}: {
  attachment: Extract<Attachment, { type: "canvas" }>;
}) {
  return (
    <div className="stovo-canvas-embed-card">
      <div className="stovo-canvas-header">
        <span className="stovo-canvas-badge">
          <StickyNote size={12} />
          <b>CANVAS</b>
        </span>
        <strong className="stovo-canvas-title">{attachment.title}</strong>
        <span className="stovo-canvas-action">Open canvas</span>
      </div>
      <div className="stovo-canvas-board-viewport">
        <div className="stovo-canvas-mini-node node-indigo">
          <b># Release Gate</b>
          <p>Security sign-off verified</p>
        </div>
        <div className="stovo-canvas-mini-node node-cyan">
          <b># Telemetry</b>
          <p>99.99% replica sync</p>
        </div>
        <div className="stovo-canvas-mini-node node-emerald">
          <b># Client Audit</b>
          <p>EU residency confirmed</p>
        </div>
      </div>
      <div className="stovo-canvas-footer">
        <small>{attachment.detail}</small>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// OpenGraph Link Unfurl Card (Matching Stovo LinkUnfurlCard)
// ----------------------------------------------------------------------------
function LinkOgUnfurlCard({
  attachment,
}: {
  attachment: Extract<Attachment, { type: "link" }>;
}) {
  return (
    <div className="stovo-og-unfurl-card">
      <div className="stovo-og-header">
        <span className="stovo-og-favicon">
          <Link2 size={13} />
        </span>
        <span className="stovo-og-sitename">{attachment.siteName}</span>
        <span className="stovo-og-domain">{attachment.domain}</span>
      </div>
      <div className="stovo-og-body">
        <strong className="stovo-og-title">{attachment.title}</strong>
        <p className="stovo-og-description">{attachment.description}</p>
      </div>
      <div className="stovo-og-image-banner">
        <div className="stovo-og-banner-content">
          <div className="stovo-og-banner-tag">{attachment.ogTag || "Workspace Resource"}</div>
          <div className="stovo-og-banner-grid">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Folder Attachment Card
// ----------------------------------------------------------------------------
function FolderEmbedCard({
  attachment,
}: {
  attachment: Extract<Attachment, { type: "folder" }>;
}) {
  return (
    <div className="stovo-folder-embed-card">
      <span className="stovo-folder-icon">
        <Folder size={20} />
      </span>
      <div className="stovo-folder-copy">
        <strong>{attachment.title}</strong>
        <small>{attachment.detail}</small>
      </div>
      <span className="stovo-folder-open-label">Open folder</span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Redesigned FilesScreen (Matching Stovo FilesPage.tsx & styles)
// ----------------------------------------------------------------------------
function FilesScreen() {
  const [selectedFilter, setSelectedFilter] = useState("all");

  const folders = [
    { name: "Q3 Launch Assets", detail: "12 files · 18 members", color: "#24364b", locked: false },
    { name: "Client Deliverables", detail: "28 files · 6 clients", color: "#315f9a", locked: true },
    { name: "Executive Records", detail: "19 files · Confidential", color: "#5b4a92", locked: true },
  ];

  const files = [
    {
      name: "Q3-launch-brief.pdf",
      size: "2.4 MB",
      type: "PDF",
      badgeColor: "#ef4444",
      icon: FileText,
    },
    {
      name: "Launch readiness.canvas",
      size: "18 cards",
      type: "CANVAS",
      badgeColor: "#8b5cf6",
      icon: StickyNote,
    },
    {
      name: "Security-Compliance-Audit.docx",
      size: "1.8 MB",
      type: "DOCX",
      badgeColor: "#3b82f6",
      icon: FileType,
    },
    {
      name: "Q3-Financial-Model.xlsx",
      size: "3.4 MB",
      type: "XLSX",
      badgeColor: "#10b981",
      icon: FileSpreadsheet,
    },
    {
      name: "Atlas-Architecture-Diagram.canvas",
      size: "24 cards",
      type: "CANVAS",
      badgeColor: "#8b5cf6",
      icon: StickyNote,
    },
    {
      name: "Acme-Phase1-Signoff.pdf",
      size: "1.1 MB",
      type: "PDF",
      badgeColor: "#ef4444",
      icon: FileText,
    },
  ];

  const filters = ["all", "documents", "canvases", "media"];

  return (
    <main className="stovo-source-screen stovo-source-files-screen">
      <div className="storage-main-header">
        <label className="search-field storage-search">
          <Search size={16} />
          <input placeholder="Search files and folders in workspace" readOnly />
        </label>

        <div className="filter-chip-row" aria-label="Storage filters">
          {filters.map((filter) => (
            <button
              type="button"
              key={filter}
              className={`filter-chip ${selectedFilter === filter ? "active" : ""}`}
              onClick={() => setSelectedFilter(filter)}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Folders row (StorageCollections) */}
      <div className="storage-collections-section">
        <div className="storage-section-heading">
          <h2>Folders &amp; collections</h2>
          <button type="button" className="storage-new-btn">
            <Plus size={14} /> New
          </button>
        </div>
        <div className="storage-collections-row">
          {folders.map((folder) => (
            <article className="storage-collection-card" key={folder.name}>
              <span className="storage-collection-cover" style={{ backgroundColor: folder.color }}>
                <Folder size={22} />
              </span>
              <div className="storage-collection-copy">
                <strong>{folder.name}</strong>
                <small>{folder.detail}</small>
              </div>
              {folder.locked && (
                <LockKeyhole size={14} className="storage-lock-icon" />
              )}
            </article>
          ))}
        </div>
      </div>

      {/* Files Grid (StorageGrid) */}
      <div className="storage-files-section">
        <div className="storage-section-heading">
          <h2>Files</h2>
          <small>59 items · Synced locally</small>
        </div>
        <div className="storage-grid">
          {files.map((file) => {
            const Icon = file.icon;
            const isCanvas = file.type === "CANVAS";

            return (
              <div className={`storage-tile ${isCanvas ? "storage-canvas-tile" : ""}`} key={file.name}>
                <div className="storage-tile-preview-area">
                  {isCanvas ? (
                    <div className="storage-tile-canvas-preview">
                      <span className="canvas-badge">
                        <StickyNote size={11} /> CANVAS
                      </span>
                      <div className="canvas-mini-bars">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  ) : (
                    <div className="storage-tile-doc-preview">
                      <span className="storage-file-type-badge" style={{ color: file.badgeColor }}>
                        <Icon size={20} />
                        <b>{file.type}</b>
                      </span>
                      <div className="storage-tile-mini-lines">
                        <span style={{ width: "75%" }} />
                        <span style={{ width: "90%" }} />
                        <span style={{ width: "60%" }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="storage-tile-info">
                  <strong>{file.name}</strong>
                  <small>{file.size}</small>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

// ----------------------------------------------------------------------------
// Redesigned PlansScreen (Matching Stovo PlansPage.tsx & styles)
// ----------------------------------------------------------------------------
function PlansScreen() {
  const [view, setView] = useState<"today" | "threeDays" | "week">("today");

  return (
    <main className="stovo-source-screen stovo-source-plans-screen">
      {/* Plans header with navigation and tabs */}
      <header className="plans-view-header">
        <div className="plans-header-nav">
          <button type="button" aria-label="Previous day" className="plans-nav-btn">
            <ChevronLeft size={16} />
          </button>
          <h2>Monday, September 14</h2>
          <button type="button" aria-label="Next day" className="plans-nav-btn">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="plans-tabs">
          <button
            type="button"
            className={view === "today" ? "active" : ""}
            onClick={() => setView("today")}
          >
            Today
          </button>
          <button
            type="button"
            className={view === "threeDays" ? "active" : ""}
            onClick={() => setView("threeDays")}
          >
            3 Days
          </button>
          <button
            type="button"
            className={view === "week" ? "active" : ""}
            onClick={() => setView("week")}
          >
            Week
          </button>
        </div>
      </header>

      {/* Plans timeline schedule (PlansTimeline) */}
      <div className="plans-timeline" role="region" aria-label="Today schedule timeline">
        {/* 09:00 slot */}
        <div className="plans-timeline-slot">
          <div className="plans-timeline-time">
            <Clock3 size={13} />
            <span>09:00</span>
          </div>
          <div className="plans-timeline-content">
            <div className="plans-timeline-line" />
            <div className="plans-empty-slot">
              <small>No events scheduled</small>
            </div>
          </div>
        </div>

        {/* 10:00 slot - Active event */}
        <div className="plans-timeline-slot">
          <div className="plans-timeline-time">
            <Clock3 size={13} />
            <span>10:00</span>
          </div>
          <div className="plans-timeline-content">
            <div className="plans-timeline-line" />
            <article className="plan-card-item">
              <div className="plan-card-header">
                <div>
                  <div className="plan-title-line">
                    <strong>Sprint Planning &amp; Launch Scope</strong>
                    <span className="plan-status-badge happening">Happening</span>
                  </div>
                  <small className="plan-location">Room 4B · Stovo Secure Video</small>
                </div>
              </div>
              <p className="plan-notes-excerpt">
                Review Q3 customer rollout checklist, resolve telemetry blockers, and finalize
                ownership assignments.
              </p>
              <div className="plan-card-footer">
                <div className="plan-created-by">
                  <span className="plan-avatar mo" style={{ overflow: "hidden", padding: 0 }}><img src="/avatars/user-elena.webp" alt="Maya Ortiz" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} /></span>
                  <small>Maya Ortiz</small>
                </div>
                <div className="plan-rsvp-actions">
                  <span>Going?</span>
                  <button type="button" className="rsvp-btn active">
                    Yes
                  </button>
                  <button type="button" className="rsvp-btn">
                    No
                  </button>
                </div>
                <div className="plan-attendees-cluster">
                  <span className="att-avatar ps" style={{ overflow: "hidden", padding: 0 }}><img src="/avatars/user-mira.webp" alt="PS" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /></span>
                  <span className="att-avatar ac" style={{ overflow: "hidden", padding: 0 }}><img src="/avatars/user-alex.webp" alt="AC" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /></span>
                  <span className="att-avatar jb" style={{ overflow: "hidden", padding: 0 }}><img src="/avatars/user-noah.webp" alt="JB" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /></span>
                  <span className="att-more">+3</span>
                </div>
              </div>
            </article>
          </div>
        </div>

        {/* 14:00 slot - Scheduled event */}
        <div className="plans-timeline-slot">
          <div className="plans-timeline-time">
            <Clock3 size={13} />
            <span>14:00</span>
          </div>
          <div className="plans-timeline-content">
            <div className="plans-timeline-line" />
            <article className="plan-card-item">
              <div className="plan-card-header">
                <div>
                  <div className="plan-title-line">
                    <strong>Atlas Stakeholder Sync</strong>
                    <span className="plan-status-badge scheduled">Scheduled</span>
                  </div>
                  <small className="plan-location">Stovo Conference Link · External</small>
                </div>
              </div>
              <p className="plan-notes-excerpt">
                Milestone 2 integration sign-off and European data residency compliance review.
              </p>
              <div className="plan-card-footer">
                <div className="plan-created-by">
                  <span className="plan-avatar ps" style={{ overflow: "hidden", padding: 0 }}><img src="/avatars/user-mira.webp" alt="Priya Shah" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} /></span>
                  <small>Priya Shah</small>
                </div>
                <div className="plan-rsvp-actions">
                  <span>Going?</span>
                  <button type="button" className="rsvp-btn active">
                    Yes
                  </button>
                  <button type="button" className="rsvp-btn">
                    No
                  </button>
                </div>
                <div className="plan-attendees-cluster">
                  <span className="att-avatar mo" style={{ overflow: "hidden", padding: 0 }}><img src="/avatars/user-elena.webp" alt="MO" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /></span>
                  <span className="att-avatar you" style={{ overflow: "hidden", padding: 0 }}><img src="/avatars/user-marcus.webp" alt="You" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /></span>
                  <span className="att-more">+2</span>
                </div>
              </div>
            </article>
          </div>
        </div>

        {/* 16:30 slot */}
        <div className="plans-timeline-slot">
          <div className="plans-timeline-time">
            <Clock3 size={13} />
            <span>16:30</span>
          </div>
          <div className="plans-timeline-content">
            <div className="plans-timeline-line" />
            <div className="plans-empty-slot">
              <small>End-of-day team sync</small>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
