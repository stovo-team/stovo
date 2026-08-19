import { createPortal } from "react-dom";

import type { Family } from "../../api/family";
import type { FamilyFile } from "../../api/files";
import { formatFileSize, saveFileToDisk } from "../../api/files";
import InviteModal from "../../components/InviteModal";
import ImageLightbox from "../../components/ImageLightbox";
import { MessageEnlargeModal } from "../../components/MessageEnlargeModal";
import { NewChatDialog } from "./sidebar/NewChatDialog";
import type { ChatOverviewController } from "./sidebar/types";

import type { PendingLocalAttachment } from "./shared/types";

export type FullViewImageState = { file: FamilyFile; previewUrl: string; messageId?: string };

export type ChatOverlaysProps = {
  accessToken: string | null;
  family: Family | null;
  chatOverview: ChatOverviewController;
  canCreateFamilyInvite: boolean;
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
  family,
  chatOverview,
  canCreateFamilyInvite,
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
              />
            </div>
          </div>,
          document.body
        )}

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
