import { Archive, FileText } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { getMessageArchiveGroups, type Chat, type MessageArchiveGroup } from "../../api/chats";
import { getOutboxMessages, type QueuedOutboxMessage } from "./outbox/messageOutboxStore";
import { chatAvatarFallbackKind, chatAvatarFile, chatAvatarTypeClass, displayChatName } from "./shared/chatPresentation";
import { RealAvatar } from "./sidebar/RealAvatar";
import { BackButton } from "../../components/BackButton";
import { useResolvedLanguage, useStrings } from "../../i18n/LanguageContext";

export function QuickAccessPanel({ accessToken, chats, currentUserId, onOpenChat, onBack, minimizedCallHeader }: { accessToken: string | null; chats: Chat[]; currentUserId?: string; onOpenChat: (chat: Chat) => void; onBack?: () => void; minimizedCallHeader?: ReactNode }) {
  const copy = useStrings().chats.quickAccess;
  const backLabel = useStrings().chats.header.backToChats;
  const locale = useResolvedLanguage();
  const [tab, setTab] = useState<"drafts" | "scheduled">("drafts");
  const [scheduledMessages, setScheduledMessages] = useState<QueuedOutboxMessage[]>([]);
  const draftRows = chats.flatMap((chat) => {
    const draft = window.localStorage.getItem(`stovo:draft:${chat.id}`)?.trim();
    return draft ? [{ chat, draft }] : [];
  });
  const scheduledRows = scheduledMessages.flatMap((message) => {
    const chat = chats.find((candidate) => candidate.id === message.chatId);
    return chat ? [{ chat, message }] : [];
  });

  useEffect(() => {
    if (tab !== "scheduled" || !currentUserId) return;
    let cancelled = false;
    void getOutboxMessages(currentUserId)
      .then((messages) => {
        if (!cancelled) setScheduledMessages(messages.filter((message) => message.status === "scheduled" || Boolean(message.scheduledFor)));
      })
      .catch(() => {
        if (!cancelled) setScheduledMessages([]);
      });
    return () => { cancelled = true; };
  }, [currentUserId, tab]);

  return (
    <section className="quick-access-panel quick-access-panel--outbox" aria-label={copy.draftsAria}>
      <header className="chat-detail-header chat-detail-header--floating quick-access-standard-header">
        {onBack && <BackButton className="mobile-back-button" ariaLabel={backLabel} onClick={onBack} />}
        <span className="avatar chat-avatar archive"><FileText size={20} /></span>
        <span className="chat-title-group"><span className="chat-title-row"><span>{copy.drafts}</span></span></span>
      </header>
      {minimizedCallHeader}
      <div className="quick-access-panel-tabs" role="tablist"><button type="button" className={tab === "drafts" ? "active" : ""} role="tab" aria-selected={tab === "drafts"} onClick={() => setTab("drafts")}>{copy.draftsTab}</button><button type="button" className={tab === "scheduled" ? "active" : ""} role="tab" aria-selected={tab === "scheduled"} onClick={() => setTab("scheduled")}>{copy.scheduledTab}</button></div>
      {tab === "drafts" && draftRows.length > 0 ? (
        <div className="archive-quick-list quick-access-draft-list">
          {draftRows.map(({ chat, draft }) => {
            const label = displayChatName(chat, currentUserId);
            return <button type="button" className="chat-list-item" key={chat.id} onClick={() => onOpenChat(chat)}><RealAvatar accessToken={accessToken} className={`avatar chat-avatar ${chatAvatarTypeClass(chat)}`} fallbackKind={chatAvatarFallbackKind(chat)} file={chatAvatarFile(chat, currentUserId)} label={label} /><span className="chat-list-copy"><span className="chat-list-topline"><strong>{label}</strong></span><span className="chat-list-preview"><span className="chat-list-draft-label">{copy.draftPrefix}</span> {draft}</span></span></button>;
          })}
        </div>
      ) : tab === "scheduled" && scheduledRows.length > 0 ? (
        <div className="archive-quick-list quick-access-scheduled-list">
          {scheduledRows.map(({ chat, message }) => {
            const label = displayChatName(chat, currentUserId);
            const scheduledFor = message.scheduledFor ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.scheduledFor)) : copy.scheduled;
            return <button type="button" className="chat-list-item" key={message.id} onClick={() => onOpenChat(chat)}><RealAvatar accessToken={accessToken} className={`avatar chat-avatar ${chatAvatarTypeClass(chat)}`} fallbackKind={chatAvatarFallbackKind(chat)} file={chatAvatarFile(chat, currentUserId)} label={label} /><span className="chat-list-copy"><span className="chat-list-topline"><strong>{label}</strong></span><span className="chat-list-preview">{message.content || copy.attachment} · {scheduledFor}</span></span></button>;
          })}
        </div>
      ) : <div className="quick-access-panel-empty"><FileText size={28} /><strong>{tab === "drafts" ? copy.noDrafts : copy.noScheduled}</strong><p>{tab === "drafts" ? copy.draftsEmpty : copy.scheduledEmpty}</p></div>}
    </section>
  );
}

export function MessageArchiveViewControls({ view, onChange }: { view: "all" | "grouped"; onChange: (view: "all" | "grouped") => void }) {
  const copy = useStrings().chats.quickAccess;
  return <div className="quick-access-panel-tabs quick-access-panel-tabs--archive-controls" role="tablist" aria-label={copy.archiveViewAria}><button type="button" className={view === "all" ? "active" : ""} role="tab" aria-selected={view === "all"} onClick={() => onChange("all")}>{copy.allMessages}</button><button type="button" className={view === "grouped" ? "active" : ""} role="tab" aria-selected={view === "grouped"} onClick={() => onChange("grouped")}>{copy.groupedByChat}</button></div>;
}

export function MessageArchivePanel({ accessToken, chats, currentUserId, onViewChange, onOpenGroup, onBack }: { accessToken: string | null; chats: Chat[]; currentUserId?: string; onViewChange: (view: "all" | "grouped") => void; onOpenGroup: (group: string) => void; onBack?: () => void }) {
  const copy = useStrings().chats.quickAccess;
  const backLabel = useStrings().chats.header.backToChats;
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
      title: sourceChat ? displayChatName(sourceChat, currentUserId) : copy.archivedChat,
      preview: copy.savedMessageCount(group.messageCount)
    };
  });
  return <section className="quick-access-panel quick-access-panel--archive" aria-label={copy.archive}>
    <header className="chat-detail-header chat-detail-header--floating quick-access-standard-header">
      {onBack && <BackButton className="mobile-back-button" ariaLabel={backLabel} onClick={onBack} />}
      <span className="avatar chat-avatar archive"><Archive aria-hidden className="avatar-fallback-svg" size={24} strokeWidth={1.75} /></span>
      <span className="chat-title-group"><span className="chat-title-row"><h1>{copy.archive}</h1></span></span>
    </header>
    <div className="quick-access-panel-tabs quick-access-panel-tabs--archive-grouped" role="tablist" aria-label={copy.archiveViewAria}><button type="button" role="tab" aria-selected={false} onClick={() => onViewChange("all")}>{copy.allMessages}</button><button type="button" className="active" role="tab" aria-selected={true}>{copy.groupedByChat}</button></div>
    <div className="archive-quick-list">
      <button type="button" className="chat-list-item" onClick={() => onOpenGroup("notes")}><span className="avatar chat-avatar archive"><FileText size={20} /></span><span className="chat-list-copy"><span className="chat-list-topline"><strong>{copy.myNotes}</strong></span><span className="chat-list-preview">{copy.notesDescription}</span></span></button>
      {rows.map((row) => {
        const sourceChat = chats.find((chat) => chat.id === row.id);
        const label = sourceChat ? displayChatName(sourceChat, currentUserId) : row.title;
        return <button type="button" className="chat-list-item" key={row.id} onClick={() => onOpenGroup(row.id)}><RealAvatar accessToken={accessToken} className={`avatar chat-avatar ${sourceChat ? chatAvatarTypeClass(sourceChat) : "archive chat-avatar--archive"}`} fallbackKind={sourceChat ? chatAvatarFallbackKind(sourceChat) : "archive"} file={sourceChat ? chatAvatarFile(sourceChat, currentUserId) : null} label={label} /><span className="chat-list-copy"><span className="chat-list-topline"><strong>{row.title}</strong></span><span className="chat-list-preview">{row.preview}</span></span></button>;
      })}
    </div>
  </section>;
}
