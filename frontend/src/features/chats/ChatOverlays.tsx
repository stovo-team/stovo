import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { Family } from "../../api/family";
import type { FamilyFile } from "../../api/files";
import { formatFileSize, saveFileToDisk } from "../../api/files";
import InviteModal from "../../components/InviteModal";
import ImageLightbox from "../../components/ImageLightbox";
import { MessageEnlargeModal } from "../../components/MessageEnlargeModal";
import { NewChatDialog } from "./sidebar/NewChatDialog";
import type { ChatOverviewController } from "./sidebar/types";
import type { Chat } from "../../api/chats";
import { GuestMeetingLinkControl } from "./calling/GuestMeetingLinkControl";
import { GuestMeetingSelect } from "./calling/GuestMeetingSelect";

import type { PendingLocalAttachment } from "./shared/types";

export type FullViewImageState = { file: FamilyFile; previewUrl: string; messageId?: string };

export type ChatOverlaysProps = {
  accessToken: string | null;
  chats: Chat[];
  family: Family | null;
  chatOverview: ChatOverviewController;
  canCreateFamilyInvite: boolean;
  currentUser?: import("../../api/auth").User | null;
  isFamilyInviteOpen: boolean;
  onCloseFamilyInvite: () => void;
  fullViewImage: FullViewImageState | null;
  isFullViewImageClosing: boolean;
  onCloseFullViewImage: () => void;
  onGoToFullViewImageMessage: () => void;
  composerEnlargeOpen: boolean;
  composerContent: string;
  renderMarkdown: boolean;
  onCloseComposerEnlarge: () => void;
  onComposerEnlargeChange: (value: string) => void;
  pendingAttachments?: PendingLocalAttachment[];
  onRemovePendingAttachment?: (localId: string) => void;
  onUpdatePendingAttachment?: (localId: string, updatedFile: File) => void;
  onAddAttachments?: (files: File[]) => void;
  onSendMessage?: () => void;
};

/**
 * Top-level modal/portal stack that floats above the chat workspace: the new
 * chat dialog, family invite modal, full-view image lightbox, and the
 * composer's enlarge-to-edit modal. Purely presentational — all state and
 * mutation logic is owned by ChatsPage and the feature hooks it composes.
 */
export function ChatOverlays({
  accessToken,
  chats,
  family,
  chatOverview,
  canCreateFamilyInvite,
  currentUser,
  isFamilyInviteOpen,
  onCloseFamilyInvite,
  fullViewImage,
  isFullViewImageClosing,
  onCloseFullViewImage,
  onGoToFullViewImageMessage,
  composerEnlargeOpen,
  composerContent,
  renderMarkdown,
  onCloseComposerEnlarge,
  onComposerEnlargeChange,
  pendingAttachments,
  onRemovePendingAttachment,
  onUpdatePendingAttachment,
  onAddAttachments,
  onSendMessage
}: ChatOverlaysProps) {
  const [isMeetingPlannerOpen, setIsMeetingPlannerOpen] = useState(false);
  const meetingChats = chats.filter((chat) => chat.type === "group" || chat.type === "voice");
  const [meetingChatId, setMeetingChatId] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingCalendarRange, setMeetingCalendarRange] = useState<{ start?: string; end?: string }>({});
  useEffect(() => {
    const raw = window.sessionStorage.getItem("stovo:guest-meeting-draft");
    if (!raw) return;
    window.sessionStorage.removeItem("stovo:guest-meeting-draft");
    try {
      const draft = JSON.parse(raw) as { chatId?: string; title?: string; startsAt?: string; endsAt?: string };
      setMeetingChatId(draft.chatId && meetingChats.some((chat) => chat.id === draft.chatId) ? draft.chatId : meetingChats[0]?.id ?? "");
      setMeetingTitle(draft.title ?? "");
      setMeetingCalendarRange({ start: draft.startsAt, end: draft.endsAt });
      setIsMeetingPlannerOpen(true);
    } catch { /* Ignore a malformed one-time draft. */ }
  }, [meetingChats]);
  const {
    isNewChatOpen, newChatScreen, filteredNewChatMembers, newChatMemberSearch, groupTitle, groupMemberIds,
    setNewChatMemberSearch, setNewChatScreen, closeNewChatScreen, startDirectChatWith,
    setGroupTitle, toggleGroupMember, handleCreateGroupChat, handleCreateChannelChat, handleCreateVoiceChat
  } = chatOverview;

  return (
    <>
      {isNewChatOpen &&
        createPortal(
          <div className="new-chat-modal-backdrop" onMouseDown={closeNewChatScreen}>
            <div onMouseDown={(event) => event.stopPropagation()}>
              <NewChatDialog
                accessToken={accessToken}
                currentUser={currentUser}
                screen={newChatScreen}
                members={filteredNewChatMembers}
                memberSearch={newChatMemberSearch}
                groupTitle={groupTitle}
                groupMemberIds={groupMemberIds}
                onMemberSearchChange={setNewChatMemberSearch}
                onScreenChange={setNewChatScreen}
                onClose={closeNewChatScreen}
                onStartDirect={(userId) => void startDirectChatWith(userId)}
                onGroupTitleChange={setGroupTitle}
                onToggleGroupMember={toggleGroupMember}
                onCreateGroup={(event) => void handleCreateGroupChat(event)}
                onCreateChannel={(event) => void handleCreateChannelChat(event)}
                onCreateVoiceChannel={(event) => void handleCreateVoiceChat(event)}
                onPlanGuestMeeting={() => { setMeetingChatId(meetingChats[0]?.id ?? ""); setMeetingTitle(""); setMeetingCalendarRange({}); setIsMeetingPlannerOpen(true); closeNewChatScreen(); }}
              />
            </div>
          </div>,
          document.body
        )}

      {isMeetingPlannerOpen && createPortal(
        <div className="guest-meeting-planner-backdrop" role="presentation" onMouseDown={() => setIsMeetingPlannerOpen(false)}>
          <section className="guest-meeting-planner" role="dialog" aria-modal="true" aria-label="Plan guest meeting" onMouseDown={(event) => event.stopPropagation()}>
            <div className="guest-meeting-planner-header"><h2>Create meeting link</h2><button type="button" className="icon-button subtle icon-button--plain" aria-label="Close" onClick={() => setIsMeetingPlannerOpen(false)}><X aria-hidden="true" size={20} /></button></div>
            {meetingChats.length ? <div className="guest-meeting-planner-body"><label className="guest-link-field"><span>Meeting space</span><GuestMeetingSelect ariaLabel="Meeting space" value={meetingChatId} onChange={setMeetingChatId} options={meetingChats.map((chat) => ({ value: chat.id, label: chat.title ?? "Untitled chat" }))} /></label><GuestMeetingLinkControl accessToken={accessToken} chatId={meetingChatId} sourceChat={meetingChats.find((chat) => chat.id === meetingChatId) ?? null} currentUserId={currentUser?.id} enabled initialTitle={meetingTitle} calendarStart={meetingCalendarRange.start} calendarEnd={meetingCalendarRange.end} /></div> : <p className="muted-copy">Create a group or voice chat first, then create a meeting link.</p>}
          </section>
        </div>, document.body)}

      {accessToken && canCreateFamilyInvite && (
        <InviteModal
          accessToken={accessToken}
          familyName={family?.name ?? "Stovo"}
          open={isFamilyInviteOpen}
          onClose={onCloseFamilyInvite}
        />
      )}

      {fullViewImage && (
        <ImageLightbox
          imageUrl={fullViewImage.previewUrl}
          isExternallyClosing={isFullViewImageClosing}
          title={fullViewImage.file.originalName}
          subtitle={`${fullViewImage.file.mimeType} / ${formatFileSize(fullViewImage.file.sizeBytes)}`}
          onClose={onCloseFullViewImage}
          onGoToMessage={fullViewImage.messageId ? onGoToFullViewImageMessage : undefined}
          onDownload={accessToken ? () => void saveFileToDisk(accessToken, fullViewImage.file) : undefined}
        />
      )}

      {composerEnlargeOpen && (
        <MessageEnlargeModal
          content={composerContent}
          renderMarkdown={renderMarkdown}
          editable
          pendingAttachments={pendingAttachments}
          onClose={onCloseComposerEnlarge}
          onChange={onComposerEnlargeChange}
          onRemovePendingAttachment={onRemovePendingAttachment}
          onUpdatePendingAttachment={onUpdatePendingAttachment}
          onAddAttachments={onAddAttachments}
          onSend={onSendMessage}
        />
      )}
    </>
  );
}
