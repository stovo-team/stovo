import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { getMessageArchiveGroups, type Chat, type MessageArchiveGroup } from "../../api/chats";
import { displayChatName } from "./shared/chatPresentation";

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
  return <div className="quick-access-panel-tabs quick-access-panel-tabs--archive-controls" role="tablist" aria-label="Message archive view"><button type="button" className={view === "all" ? "active" : ""} role="tab" aria-selected={view === "all"} onClick={() => onChange("all")}>All messages</button><button type="button" className={view === "grouped" ? "active" : ""} role="tab" aria-selected={view === "grouped"} onClick={() => onChange("grouped")}>Grouped by chat</button></div>;
}

export function MessageArchivePanel({ accessToken, chats, currentUserId, onViewChange, onOpenGroup }: { accessToken: string | null; chats: Chat[]; currentUserId?: string; onViewChange: (view: "all" | "grouped") => void; onOpenGroup: (group: string) => void }) {
  const [groups, setGroups] = useState<MessageArchiveGroup[]>([]);

  useEffect(() => {
    if (!accessToken) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    void getMessageArchiveGroups(accessToken)
      .then((result) => {
        if (!cancelled) setGroups(result);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });
    return () => { cancelled = true; };
  }, [accessToken]);

  const rows = groups.map((group) => {
    const sourceChat = chats.find((chat) => chat.id === group.sourceChatId);
    return {
      id: group.sourceChatId,
      title: sourceChat ? displayChatName(sourceChat, currentUserId) : "Archived chat",
      preview: `${group.messageCount} saved ${group.messageCount === 1 ? "message" : "messages"}`
    };
  });
  return <section className="quick-access-panel quick-access-panel--archive" aria-label="Message Archive">
    <header className="chat-detail-header chat-detail-header--floating quick-access-standard-header"><span className="avatar chat-avatar archive"><FileText size={20} /></span><span className="chat-title-group"><span className="chat-title-row"><h1>Message Archive</h1></span></span></header>
    <div className="quick-access-panel-tabs" role="tablist" aria-label="Message archive view"><button type="button" role="tab" aria-selected={false} onClick={() => onViewChange("all")}>All messages</button><button type="button" className="active" role="tab" aria-selected={true}>Grouped by chat</button></div>
    <div className="archive-quick-list">
      <button type="button" className="chat-list-item" onClick={() => onOpenGroup("notes")}><span className="avatar chat-avatar archive"><FileText size={20} /></span><span className="chat-list-copy"><span className="chat-list-topline"><strong>My Notes</strong></span><span className="chat-list-preview">Messages saved directly to Message Archive</span></span></button>
      {rows.map((chat) => <button type="button" className="chat-list-item" key={chat.id} onClick={() => onOpenGroup(chat.id)}><span className="avatar chat-avatar archive"><FileText size={20} /></span><span className="chat-list-copy"><span className="chat-list-topline"><strong>{chat.title}</strong></span><span className="chat-list-preview">{chat.preview}</span></span></button>)}
    </div>
  </section>;
}
