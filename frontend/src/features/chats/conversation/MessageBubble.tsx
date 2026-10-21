import { CSSProperties, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, useState, useEffect } from "react";
import { ArrowUpRight, CalendarClock, CalendarPlus, Check, Clock3, DoorOpen, Folder, Loader2, LockKeyhole, Phone, StickyNote, Video } from "lucide-react";

import { useStrings } from "../../../i18n/LanguageContext";
import { SourceMessageAttribution } from "./SourceMessageAttribution";
import { callHistoryLabel, callHistoryTimestamp } from "../../../callHistory";
import type { Chat } from "../../../api/chats";
import type { FamilyFile } from "../../../api/files";
import { videoPlaybackSession } from "../../../videoPlaybackSession";
import { MessageMarkdown } from "../../../messageMarkdown";
import MessageMediaAlbum, { partitionMessageAttachments } from "../../../components/MessageMediaAlbum";
import { LinkUnfurlCard } from "../../../components/LinkUnfurlCard";
import { RealAvatar } from "../sidebar/RealAvatar";
import { PollBubble } from "./PollBubble";
import { ChecklistCardBubble } from "./ChecklistCardBubble";
import { ThreadSummaryButton } from "./ThreadSummaryButton";
import { CanvasCardBubble } from "./CanvasCardBubble";
import type { Poll } from "../../../api/polls";
import type { ChecklistCard } from "../../../api/checklist";
import { getApiUrl, getClusterPrefix } from "../../../api/client";

type NotesTranscript = { segments: Array<{ id: string; participantName?: string; participantId: string; startMs: number; exactText: string }> };

type GuestMeetingCardData = {
  title: string;
  timing: string;
  entry: string;
  url: string;
};

function guestMeetingCard(content: string | null | undefined): GuestMeetingCardData | null {
  const prefix = "guest-meeting-card:";
  if (!content?.startsWith(prefix)) return null;
  try {
    const value = JSON.parse(content.slice(prefix.length)) as Partial<GuestMeetingCardData>;
    if (
      typeof value.title !== "string" || typeof value.timing !== "string" ||
      typeof value.entry !== "string" || typeof value.url !== "string" ||
      !/^https?:\/\/[^\s]+$/i.test(value.url)
    ) return null;
    return value as GuestMeetingCardData;
  } catch {
    return null;
  }
}

function GuestMeetingInvitation({ meeting, sourceChatId }: { meeting: GuestMeetingCardData; sourceChatId: string }) {
  const copy = useStrings().auditUi;
  const addToPlans = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
    window.sessionStorage.setItem("stovo:plan-draft", JSON.stringify({
      title: meeting.title,
      notes: `Join meeting: ${meeting.url}`,
      sourceChatId
    }));
  };

  return (
    <section className="guest-meeting-invitation" aria-label={copy.guestMeeting(meeting.title)}>
      <span className="guest-meeting-invitation-icon" aria-hidden="true"><Video size={20} /></span>
      <div className="guest-meeting-invitation-copy">
        <strong>{meeting.title}</strong>
        <span className="guest-meeting-invitation-detail"><CalendarClock size={14} />{meeting.timing}</span>
        <span className="guest-meeting-invitation-detail"><DoorOpen size={14} />{meeting.entry}</span>
      </div>
      <div className="guest-meeting-invitation-actions">
        <a
          className="guest-meeting-invitation-join"
          href={meeting.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {copy.joinMeetingAction} <ArrowUpRight size={16} />
        </a>
        <a className="guest-meeting-invitation-plan" href={`${getClusterPrefix()}/app/plans`} onClick={addToPlans}>
          <CalendarPlus size={16} /> {copy.plansAction}
        </a>
      </div>
    </section>
  );
}

export function extractFirstUrl(content: string | null | undefined): string | null {
  const previewURL = extractMessageLinks(content ?? null)[0];
  if (previewURL) return previewURL;
  if (!content) return null;
  const match = /https?:\/\/[^\s<>"']+/i.exec(content);
  if (!match) return null;
  let urlStr = match[0];
  while (urlStr.length > 0 && /[.,!?;:)]$/.test(urlStr)) {
    urlStr = urlStr.slice(0, -1);
  }
  return urlStr;
}

function embeddedCanvasReference(content: string | null | undefined) {
  const match = /^canvas:([^\n]+)\n?([\s\S]*)$/u.exec(content ?? "");
  if (!match) return null;
  return { id: match[1], title: match[2].trim() || "Untitled canvas", available: true };
}

function embeddedChecklistReference(content: string | null | undefined): ChecklistCard | null {
  const match = /^checklist:([^\n]+)\n?([\s\S]*)$/u.exec(content ?? "");
  if (!match) return null;
  return {
    id: match[1],
    title: match[2].trim() || "Untitled checklist",
    category: "general",
    available: true,
    items: [],
    totalItems: 0,
    completedItems: 0,
    canManage: false
  };
}
import type { CallPhase } from "../shared/types";
import {
  emojiSizeClass,
  isGroupedMessage,
  isImageAttachment,
  messageActionSummary,
  messageDeliveryLabel,
  extractMessageLinks,
  messageHasOnlyMediaAttachments,
  messageOriginChatId,
  messageReceiptState,
  shouldShowMessageSender
} from "../shared/messagePresentation";
import { SWIPE_REPLY_TRIGGER_OFFSET } from "../shared/messageGestures";
import { uniqueUserIds } from "../shared/messageState";
import type { Message, SwipeReplyState } from "../shared/types";
import { AttachmentCard, MessageImageAttachment } from "./MessageAttachmentThumbs";

export function MessageBubble({
  message,
  previousMessage,
  currentUserId,
  selectedChat,
  chats,
  messages,
  memberLookup,
  accessToken,
  videoAutoplay,
  renderMarkdown,
  callActive,
  isMessageSelectionMode,
  isSelected,
  swipeReplyState,
  threadReplyCount,
  showThreadButton = true,
  isEditing = false,
  onSaveEdit,
  onCancelEdit,
  onBubbleClick,
  onContextMenu,
  onSwipePointerDown,
  onSwipePointerMove,
  onSwipePointerUp,
  onSwipePointerCancel,
  onOpenImage,
  onFocusRepliedMessage,
  onOpenOriginChat,
  onReact,
  onOpenThread,
  onVotePoll,
  onClosePoll,
  onViewPollVoters
}: {
  message: Message;
  previousMessage: Message | undefined;
  currentUserId: string | undefined;
  selectedChat: Chat;
  chats: Chat[];
  messages: Message[];
  memberLookup: Map<string, { displayName: string; username?: string }>;
  accessToken: string | null;
  videoAutoplay: boolean;
  renderMarkdown: boolean;
  callActive: boolean;
  isMessageSelectionMode: boolean;
  isSelected: boolean;
  swipeReplyState: SwipeReplyState | null;
  threadReplyCount: number;
  showThreadButton?: boolean;
  isEditing?: boolean;
  onSaveEdit?: (message: Message, newContent: string) => Promise<void>;
  onCancelEdit?: () => void;
  onBubbleClick: (event: ReactMouseEvent<HTMLElement>, message: Message) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>, message: Message) => void;
  onSwipePointerDown: (event: ReactPointerEvent<HTMLElement>, message: Message) => void;
  onSwipePointerMove: (event: ReactPointerEvent<HTMLElement>, message: Message) => void;
  onSwipePointerUp: (event: ReactPointerEvent<HTMLElement>, message: Message) => void;
  onSwipePointerCancel: (event: ReactPointerEvent<HTMLElement>, message: Message) => void;
  onOpenImage: (file: FamilyFile, previewUrl: string, messageId?: string) => void;
  onFocusRepliedMessage: (messageId: string) => void;
  onOpenOriginChat: (chat: Chat) => void;
  onReact: (message: Message, emoji: string) => void;
  onOpenThread: (message: Message) => void;
  onVotePoll?: (pollId: string, optionIds: string[]) => Promise<void> | void;
  onClosePoll?: (pollId: string) => Promise<void> | void;
  onViewPollVoters?: (poll: Poll) => void;
}) {
  const strings = useStrings();
  const copy = strings.auditUi;
  const mine = message.senderId === currentUserId;
  const [inlineContent, setInlineContent] = useState(message.content ?? "");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [notesTranscript, setNotesTranscript] = useState<NotesTranscript | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [transcriptError, setTranscriptError] = useState("");

  useEffect(() => {
    if (isEditing) {
      setInlineContent(message.content ?? "");
      setIsSavingEdit(false);
    }
  }, [isEditing, message.content]);

  const handleInlineSave = async () => {
    if (!onSaveEdit || !inlineContent.trim() || isSavingEdit) return;
    try {
      setIsSavingEdit(true);
      await onSaveEdit(message, inlineContent.trim());
    } finally {
      setIsSavingEdit(false);
    }
  };

  if (message.type === "call" && message.call) {
    const isVideoCall = message.call.callType === "video";
    const CallIcon = isVideoCall ? Video : Phone;
    return (
      <article className="call-history-message" id={message.id} key={message.id}>
        <CallIcon aria-hidden="true" size={18} />
        <span>
          <strong>{callHistoryLabel(message.call, strings)}</strong>
          <small>{isVideoCall ? strings.callHistory.videoCall : strings.callHistory.audioCall}</small>
        </span>
        <time>{callHistoryTimestamp(message.createdAt)}</time>
      </article>
    );
  }

  const grouped = isGroupedMessage(message, previousMessage, currentUserId);
  const repliedMessage = message.replyToMessageId
    ? messages.find((candidate) => candidate.id === message.replyToMessageId)
    : null;
  const senderProfile = selectedChat.members.find((member) => member.id === message.senderId);
  const showSenderIdentity = shouldShowMessageSender(selectedChat.type, mine) || Boolean(message.importAttribution);
  const mediaOnlyMessage = messageHasOnlyMediaAttachments(message);
  const hasCaption = Boolean(message.content?.trim());
  const meetingInvitation = guestMeetingCard(message.content);
  const isAICallNotes = Boolean(message.content?.startsWith("AI call notes"));
  const loadNotesTranscript = async () => {
    if (notesTranscript) {
      setIsTranscriptOpen((open) => !open);
      return;
    }
    if (!accessToken || isLoadingTranscript) return;
    setIsLoadingTranscript(true);
    setTranscriptError("");
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const linkResponse = await fetch(`${getApiUrl()}/api/chats/${encodeURIComponent(selectedChat.id)}/messages/${encodeURIComponent(message.id)}/transcript`, { headers });
      if (!linkResponse.ok) throw new Error("Transcript is unavailable");
      const { callId } = await linkResponse.json() as { callId: string };
      const transcriptResponse = await fetch(`${getApiUrl()}/api/calls/${encodeURIComponent(callId)}/transcript`, { headers });
      if (!transcriptResponse.ok) throw new Error("Could not load transcript");
      setNotesTranscript(await transcriptResponse.json() as NotesTranscript);
      setIsTranscriptOpen(true);
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : "Could not load transcript");
    } finally {
      setIsLoadingTranscript(false);
    }
  };
  const swipeStateForMessage = swipeReplyState?.messageId === message.id ? swipeReplyState : null;
  const swipeProgress = swipeStateForMessage
    ? Math.min(swipeStateForMessage.offset / SWIPE_REPLY_TRIGGER_OFFSET, 1)
    : 0;
  const swipeStyle = swipeStateForMessage
    ? ({
        "--message-swipe-offset": `${swipeStateForMessage.offset}px`,
        "--message-swipe-progress": String(swipeProgress)
      } as CSSProperties)
    : undefined;
  const originChatId = messageOriginChatId(chats, message.forwardedFrom?.chatId, repliedMessage?.senderId);
  const originChat = originChatId ? chats.find((chat) => chat.id === originChatId) ?? null : null;
  const receiptState = messageReceiptState(message, mine);
  const messageMeta = (
    <span className="message-meta">
      {messageDeliveryLabel(message, mine)}
      {mine && message.deliveryState === "sending" ? (
        <Clock3
          aria-label={copy.queuedMessage}
          className="message-receipt message-receipt--sending"
          role="img"
          size={14}
        />
      ) : mine && message.deliveryState === "scheduled" ? (
        <CalendarClock
          aria-label={copy.scheduledMessage}
          className="message-receipt message-receipt--scheduled"
          role="img"
          size={14}
        />
      ) : receiptState ? (
        <svg
          aria-label={copy.receiptMessage(receiptState)}
          className={`message-receipt message-receipt--${receiptState}`}
          role="img"
          viewBox="0 0 24 24"
        >
          {receiptState === "sent" ? (
            <path d="m2 12 4 4 9-10" />
          ) : (
            <>
              <path d="m2 12 4 4 9-10" />
              <path d="m9 12 4 4 9-10" />
            </>
          )}
        </svg>
      ) : null}
    </span>
  );

  return (
    <article
      className={`message-bubble ${selectedChat.type === "direct" ? "direct" : ""} ${mine ? "mine" : ""} ${grouped ? "grouped" : ""} ${message.deliveryState ?? ""} ${mediaOnlyMessage ? "has-photo-attachments" : ""} ${emojiSizeClass(message.content)}${swipeStateForMessage ? " is-swipe-active" : ""}${swipeStateForMessage?.activated ? " is-swipe-armed" : ""}${isMessageSelectionMode ? " is-selection-mode" : ""}${isSelected ? " is-selected" : ""}`}
      id={message.id}
      aria-pressed={isMessageSelectionMode ? isSelected : undefined}
      onClick={(event) => onBubbleClick(event, message)}
      onContextMenu={(event) => onContextMenu(event, message)}
      onPointerCancel={(event) => onSwipePointerCancel(event, message)}
      onPointerDown={(event) => onSwipePointerDown(event, message)}
      onPointerMove={(event) => onSwipePointerMove(event, message)}
      onPointerUp={(event) => onSwipePointerUp(event, message)}
      style={swipeStyle}
    >
      {isSelected && (
        <span className="message-selection-indicator" aria-hidden="true">
          <Check size={14} />
        </span>
      )}
      {swipeStateForMessage && <span className="message-swipe-affordance" aria-hidden="true" />}
      {showSenderIdentity && (
        <div className="message-sender-row">
          <RealAvatar
            accessToken={accessToken}
            className="avatar message-sender-avatar"
            file={senderProfile?.profilePhoto ?? null}
            label={message.senderDisplayName ?? senderProfile?.displayName ?? "Family member"}
          />
          <strong className="message-sender">
            {message.senderDisplayName ?? senderProfile?.displayName ?? "Family member"}
          </strong>
        </div>
      )}
      {message.importAttribution && <SourceMessageAttribution attribution={message.importAttribution} />}
      {(repliedMessage || message.forwardedFrom) && (
        <div
          className={
            repliedMessage ? "message-origin-card" : "message-origin-card message-origin-card--forwarded"
          }
        >
          <span className="message-origin-label">
            {repliedMessage ? "Reply to " : "Forwarded from "}
            {originChat ? (
              <button
                type="button"
                className="message-origin-name"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenOriginChat(originChat);
                }}
              >
                {repliedMessage?.senderDisplayName ?? message.forwardedFrom?.senderDisplayName ?? "Family member"}
              </button>
            ) : (
              <span className="message-origin-name">
                {repliedMessage?.senderDisplayName ?? message.forwardedFrom?.senderDisplayName ?? "Family member"}
              </span>
            )}
          </span>
          {repliedMessage && (
            <button
              type="button"
              className="message-origin-preview"
              onClick={(event) => {
                event.stopPropagation();
                onFocusRepliedMessage(repliedMessage.id);
              }}
            >
              {messageActionSummary(repliedMessage)}
            </button>
          )}
        </div>
      )}
      {message.attachments.length > 0 &&
        (() => {
          const { media, other } = partitionMessageAttachments(message.attachments);
          const showAlbumMeta = mediaOnlyMessage && !hasCaption && media.length > 0;
          const mediaDisabledReason = callActive ? "Media playback is paused while a call is active" : undefined;
          const renderSingleAttachment = (file: FamilyFile) => (
            <AttachmentCard
              accessToken={accessToken}
              chatId={message.chatId}
              file={file}
              messageId={message.id}
              disabledReason={mediaDisabledReason}
              onBeforeAudioPlay={async () => {
                videoPlaybackSession.pauseActive();
              }}
              compact
              onOpenImage={onOpenImage}
              videoAutoplay={videoAutoplay}
            />
          );

          return (
            <div className="message-attachments">
              {media.length > 1 ? (
                <div className={showAlbumMeta ? "message-photo-stack message-media-album-stack" : "message-media-album-stack"}>
                  <MessageMediaAlbum
                    accessToken={accessToken}
                    chatId={message.chatId}
                    messageId={message.id}
                    files={media}
                    disabledReason={mediaDisabledReason}
                    videoAutoplay={videoAutoplay}
                    renderImage={(file) => (
                      <MessageImageAttachment accessToken={accessToken} file={file} onOpenImage={onOpenImage} />
                    )}
                  />
                  {showAlbumMeta ? messageMeta : null}
                </div>
              ) : (
                media.map((file) => {
                  const showOverlayMeta = showAlbumMeta && isImageAttachment(file);
                  const attachment = renderSingleAttachment(file);
                  if (!showOverlayMeta) {
                    return <div key={file.id}>{attachment}</div>;
                  }
                  return (
                    <div className="message-photo-stack" key={file.id}>
                      {attachment}
                      {messageMeta}
                    </div>
                  );
                })
              )}
              {other.map((file) => (
                <div key={file.id}>{renderSingleAttachment(file)}</div>
              ))}
            </div>
          );
        })()}
      {(hasCaption || message.deliveryError || !mediaOnlyMessage || isEditing) && (
        <div className="message-bubble-inner">
          {isEditing ? (
            <div
              className="message-inline-editor"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <textarea
                className="message-inline-editor-textarea"
                value={inlineContent}
                onChange={(e) => setInlineContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleInlineSave();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onCancelEdit?.();
                  }
                }}
                autoFocus
                rows={Math.max(2, inlineContent.split("\n").length)}
              />
              <div className="message-inline-editor-actions">
                <button
                  type="button"
                  className="message-inline-editor-btn cancel"
                  disabled={isSavingEdit}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelEdit?.();
                  }}
                >{copy.cancel}</button>
                <button
                  type="button"
                  className="message-inline-editor-btn save"
                  disabled={isSavingEdit || !inlineContent.trim()}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleInlineSave();
                  }}
                >
                  {isSavingEdit ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {message.type === "checklist" && (message.checklist ?? embeddedChecklistReference(message.content)) ? (() => {
                const checklist = message.checklist ?? embeddedChecklistReference(message.content)!;
                return (
                  <ChecklistCardBubble
                    checklist={checklist}
                    accessToken={accessToken}
                    currentUserId={currentUserId}
                    onOpenChecklist={() => {
                      if (checklist.available) window.location.assign(`${getClusterPrefix()}/app/checklist/${encodeURIComponent(checklist.id)}`);
                    }}
                  />
                );
              })() : message.type === "canvas" && (message.canvas ?? embeddedCanvasReference(message.content)) ? (() => {
                const canvas = message.canvas ?? embeddedCanvasReference(message.content)!;
                return (
                  <CanvasCardBubble
                    canvas={canvas}
                    accessToken={accessToken}
                    onOpenCanvas={() => {
                      if (canvas.available) window.location.assign(`${getClusterPrefix()}/app/canvas/${encodeURIComponent(canvas.id)}`);
                    }}
                  />
                );
              })() : message.type === "collection" && message.collection ? (
                <button
                  type="button"
                  className="message-collection-card"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (message.collection?.available) window.location.assign(`/app/files?collection=${encodeURIComponent(message.collection.id)}`);
                  }}
                  disabled={!message.collection.available}
                >
                  <span className="message-collection-card-icon">{message.collection.available ? <Folder size={22} /> : <LockKeyhole size={22} />}</span>
                  <span><strong>{message.collection.available ? message.collection.title : "Collection unavailable"}</strong><small>{message.collection.available ? `${message.collection.itemCount ?? 0} items · ${message.collection.displayKind ?? "collection"}` : "You no longer have access"}</small></span>
                  {message.collection.available && <span className="message-collection-open">{copy.open}</span>}
                </button>
              ) : message.type === "poll" && message.poll ? (
                <PollBubble
                  poll={message.poll}
                  currentUserId={currentUserId ?? ""}
                  onVote={(pollId, optionIds) => onVotePoll?.(pollId, optionIds)}
                  onClosePoll={(pollId) => onClosePoll?.(pollId)}
                  onViewVoters={(poll) => onViewPollVoters?.(poll)}
                  canClosePoll={mine || selectedChat.createdBy === currentUserId}
                />
              ) : meetingInvitation ? (
                <GuestMeetingInvitation meeting={meetingInvitation} sourceChatId={selectedChat.id} />
              ) : message.content === "__call_recording_processing__" ? <div className="message-body recording-processing-message"><Loader2 size={15} className="audio-player-spin" aria-hidden="true" /><span>{copy.videoProcessing}</span></div> : hasCaption ? (
                <>
                  <div className="message-body">
                    {renderMarkdown ? <MessageMarkdown source={message.content} /> : message.content}
                    {message.isEdited && (
                      <span className="message-edited-label" aria-label={copy.edited}>
                        (edited)
                      </span>
                    )}
                  </div>
                  {(() => {
                    const firstUrl = extractFirstUrl(message.content);
                    return firstUrl ? <LinkUnfurlCard url={firstUrl} accessToken={accessToken} /> : null;
                  })()}
                  {isAICallNotes && (
                    <div className="ai-notes-transcript-entry">
                      <button type="button" onClick={(event) => { event.stopPropagation(); void loadNotesTranscript(); }} disabled={isLoadingTranscript}>
                        {isLoadingTranscript ? "Loading transcript…" : isTranscriptOpen ? "Hide transcript" : "View transcript"}
                      </button>
                      {transcriptError && <span role="alert">{transcriptError}</span>}
                      {isTranscriptOpen && notesTranscript && (
                        <div className="ai-notes-transcript-segments">
                          {notesTranscript.segments.map((segment) => (
                            <p key={segment.id}>
                              <time>{`${Math.floor(segment.startMs / 60_000).toString().padStart(2, "0")}:${Math.floor(segment.startMs / 1000 % 60).toString().padStart(2, "0")}`}</time>{" "}
                              <strong>{segment.participantName || segment.participantId}</strong> {segment.exactText}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : null}
              {message.deliveryError ? <p className="encrypted-message-unavailable">{message.deliveryError}</p> : null}
              {(!mediaOnlyMessage || hasCaption || message.type === "poll") && messageMeta}
            </>
          )}
        </div>
      )}
      {message.reactions.length > 0 && (
        <div className="message-reactions" aria-label={copy.messageReactions}>
          {message.reactions.map((reaction) => {
            const userIds = uniqueUserIds(reaction.userIds);
            const names = userIds
              .map((userId) => memberLookup.get(userId)?.displayName ?? "Family member")
              .join(", ");
            const reacted = currentUserId ? userIds.includes(currentUserId) : reaction.reacted;
            return (
              <button
                type="button"
                className={`reaction-pill ${reacted ? "active" : ""}`}
                aria-label={copy.reactionFrom(reaction.emoji, names)}
                title={names}
                key={reaction.emoji}
                onClick={() => onReact(message, reaction.emoji)}
              >
                <span className="reaction-emoji">{reaction.emoji}</span>
                <span className="reaction-avatar-stack" aria-hidden="true">
                  {userIds.slice(0, userIds.length > 3 ? 2 : 3).map((userId) => {
                    const user = memberLookup.get(userId);
                    return (
                      <RealAvatar key={userId} accessToken={accessToken} className="avatar reaction-avatar"
                        file={selectedChat.members.find((member) => member.id === userId)?.profilePhoto} label={user?.displayName ?? "?"} />
                    );
                  })}
                  {userIds.length > 3 && <span className="reaction-avatar reaction-avatar-more">+{userIds.length - 2}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {showThreadButton && threadReplyCount > 0 && message.messageKind === "chat" && message.type !== "call" && selectedChat.type !== "archive" &&
        (selectedChat.type !== "channel" || selectedChat.commentsEnabled) && (
        <ThreadSummaryButton message={message} messages={messages} chat={selectedChat} count={threadReplyCount}
          currentUserId={currentUserId} accessToken={accessToken} onOpen={() => onOpenThread(message)} />
      )}
    </article>
  );
}
