import { FileText } from "lucide-react";
import { useState } from "react";
import type { Chat } from "../../api/chats";

export function QuickAccessPanel() {
  const [tab, setTab] = useState<"drafts" | "scheduled">("drafts");
  return (
    <section className="quick-access-panel quick-access-panel--outbox" aria-label="Drafts and scheduled messages">
      <header className="chat-detail-header chat-detail-header--floating quick-access-standard-header"><span className="avatar chat-avatar archive"><FileText size={20} /></span><span className="chat-title-group"><span className="chat-title-row"><span>Drafts &amp; scheduled</span></span></span></header>
      <div className="quick-access-panel-tabs" role="tablist"><button type="button" className={tab === "drafts" ? "active" : ""} role="tab" aria-selected={tab === "drafts"} onClick={() => setTab("drafts")}>Drafts</button><button type="button" className={tab === "scheduled" ? "active" : ""} role="tab" aria-selected={tab === "scheduled"} onClick={() => setTab("scheduled")}>Scheduled</button></div>
      <div className="quick-access-panel-empty"><FileText size={28} /><strong>{tab === "drafts" ? "No drafts" : "No scheduled messages"}</strong><p>{tab === "drafts" ? "Drafts from all chats will appear here." : "Scheduled messages from all chats will appear here."}</p></div>
    </section>
  );
}

export function MessageArchiveViewControls({ view, onChange }: { view: "all" | "grouped"; onChange: (view: "all" | "grouped") => void }) {
  return <div className="message-archive-view-controls"><button type="button" className={view === "all" ? "active" : ""} onClick={() => onChange("all")}>All messages</button><button type="button" className={view === "grouped" ? "active" : ""} onClick={() => onChange("grouped")}>Grouped by chat</button></div>;
}

export function MessageArchivePanel({ chats, onViewChange, onOpenChat }: { chats: Chat[]; onViewChange: (view: "all" | "grouped") => void; onOpenChat: (chat: Chat) => void }) {
  const rows = chats.filter((chat) => chat.type !== "archive" && chat.lastMessageContent).slice(0, 5);
  return <section className="quick-access-panel quick-access-panel--archive" aria-label="Message Archive">
    <header className="chat-detail-header chat-detail-header--floating quick-access-standard-header"><span className="avatar chat-avatar archive"><FileText size={20} /></span><span className="chat-title-group"><span className="chat-title-row"><h1>Message Archive</h1></span></span></header>
    <div className="quick-access-panel-tabs" role="tablist" aria-label="Message archive view"><button type="button" role="tab" aria-selected={false} onClick={() => onViewChange("all")}>All messages</button><button type="button" className="active" role="tab" aria-selected={true}>Grouped by chat</button></div>
    {rows.length ? <div className="archive-quick-list">{rows.map((chat) => <button type="button" className="chat-list-item" key={chat.id} onClick={() => onOpenChat(chat)}><span className="avatar chat-avatar archive"><FileText size={20} /></span><span className="chat-list-copy"><span className="chat-list-topline"><strong>{chat.title ?? "Chat"}</strong></span><span className="chat-list-preview">{chat.lastMessageContent}</span></span></button>)}</div> : <div className="quick-access-panel-empty"><FileText size={28} /><strong>No archived messages</strong><p>Saved messages will appear here.</p></div>}
  </section>;
}
