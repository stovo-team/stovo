import { FormEvent } from "react";

import type { User } from "../../../api/auth";
import type { NewChatScreen } from "../shared/types";
import { RealAvatar } from "./RealAvatar";
import { useStrings } from "../../../i18n/LanguageContext";
import { BackButton } from "../../../components/BackButton";
import { PopupCloseButton } from "../../../components/ui/Popup";
import { PopupButton } from "../../../components/ui/PopupButton";
import { PopupField } from "../../../components/ui/PopupField";

export function NewChatDialog({
  accessToken,
  currentUser,
  screen,
  members,
  memberSearch,
  groupTitle,
  groupMemberIds,
  onMemberSearchChange,
  onScreenChange,
  onClose,
  onStartDirect,
  onGroupTitleChange,
  onToggleGroupMember,
  onCreateGroup,
  onCreateChannel,
  onCreateVoiceChannel,
  onPlanGuestMeeting
}: {
  accessToken: string | null;
  currentUser?: User | null;
  screen: NewChatScreen;
  members: User[];
  memberSearch: string;
  groupTitle: string;
  groupMemberIds: string[];
  onMemberSearchChange: (value: string) => void;
  onScreenChange: (screen: NewChatScreen) => void;
  onClose: () => void;
  onStartDirect: (userId: string) => void;
  onGroupTitleChange: (value: string) => void;
  onToggleGroupMember: (userId: string) => void;
  onCreateGroup: (event: FormEvent) => void;
  onCreateChannel: (event: FormEvent) => void;
  onCreateVoiceChannel?: (event: FormEvent) => void;
  onPlanGuestMeeting?: () => void;
}) {
  const strings = useStrings();
  const isChannel = screen === "channel";
  const isVoice = screen === "voice";
  const composeFormId = isVoice
    ? "new-voice-form"
    : isChannel
      ? "new-channel-form"
      : "new-group-form";
  const canCreateCompose = groupTitle.trim().length > 0;
  const canManageSpaces = currentUser?.role === "owner" || currentUser?.permissions?.includes("manage_channels") === true;

  if (screen === "group" || screen === "channel" || screen === "voice") {
    const handleFormSubmit = (event: FormEvent) => {
      event.preventDefault();
      if (isVoice && onCreateVoiceChannel) {
        onCreateVoiceChannel(event);
      } else if (isChannel) {
        onCreateChannel(event);
      } else {
        onCreateGroup(event);
      }
    };

    const titleLabel = isVoice
      ? strings.chats.newChat.newVoiceChannel
      : isChannel
        ? strings.chats.newChat.newChannel
        : strings.chats.newChat.newGroup;
    const fieldPlaceholder = isVoice
      ? strings.chats.newChat.voiceChannelTitlePlaceholder
      : isChannel
        ? strings.chats.newChat.channelTitlePlaceholder
        : strings.chats.newChat.groupTitlePlaceholder;

    return (
      <>
        <header className="new-chat-screen-header">
          <BackButton className="new-chat-screen-back" ariaLabel="Back" onClick={() => onScreenChange("pick")} />
          <h2 id="new-chat-compose-title">{titleLabel}</h2>
          <PopupCloseButton ariaLabel={strings.chats.newChat.close} onClick={onClose} />
        </header>
        <form
          id={composeFormId}
          className="new-chat-compose"
          onSubmit={handleFormSubmit}
        >
          <PopupField
            label={fieldPlaceholder}
            autoFocus
            maxLength={255}
            placeholder={fieldPlaceholder}
            value={groupTitle}
            onChange={(event) => onGroupTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canCreateCompose) {
                event.preventDefault();
                handleFormSubmit(event);
              }
            }}
          />
          <PopupField label={strings.chats.searchPlaceholder} type="search" placeholder={strings.chats.searchPlaceholder} value={memberSearch} onChange={(event) => onMemberSearchChange(event.target.value)} />
          <PopupButton type="submit" variant="primary" disabled={!canCreateCompose}>
            {strings.chats.newChat.create}
          </PopupButton>
          <p className="new-chat-section-label">
            {strings.chats.details.members} ({groupMemberIds.length + (currentUser ? 1 : 0)})
          </p>
          <ul className="new-chat-contact-list">
            {currentUser && (
              <li key={currentUser.id}>
                <div
                  className="new-chat-contact-row selected is-creator"
                  aria-label={strings.chats.newChat.creatorAriaLabel(currentUser.displayName, strings.chats.newChat.you)}
                >
                  <RealAvatar
                    accessToken={accessToken}
                    className="avatar chat-avatar"
                    file={currentUser.profilePhoto}
                    label={currentUser.displayName}
                  />
                  <span className="new-chat-contact-copy">
                    <strong>{currentUser.displayName} ({strings.chats.newChat.you ?? "You"})</strong>
                    <small>{strings.chats.newChat.creatorRole ?? "Creator"}</small>
                  </span>
                  <span className="new-chat-check selected" aria-hidden={true}>
                    <span className="ms-icon ms-icon--20 ms-icon--filled">check_circle</span>
                  </span>
                </div>
              </li>
            )}
            {members.map((member) => {
              const selected = groupMemberIds.includes(member.id);
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    className={`new-chat-contact-row${selected ? " selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => onToggleGroupMember(member.id)}
                  >
                    <RealAvatar
                      accessToken={accessToken}
                      className="avatar chat-avatar"
                      file={member.profilePhoto}
                      label={member.displayName}
                    />
                    <span className="new-chat-contact-copy">
                      <strong>{member.displayName}</strong>
                      <small>{member.role}</small>
                    </span>
                    <span className={`new-chat-check${selected ? " selected" : ""}`} aria-hidden={true}>
                      {selected ? (
                        <span className="ms-icon ms-icon--20 ms-icon--filled">check_circle</span>
                      ) : (
                        <span className="ms-icon ms-icon--20">radio_button_unchecked</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {members.length === 0 && (
            <div className="new-chat-solo-hint">
              <span className="ms-icon ms-icon--20" aria-hidden={true}>info</span>
              <span>
                {strings.chats.newChat.soloCreationHint ?? "You can create this chat for 1 person (yourself) and invite others anytime."}
              </span>
            </div>
          )}
        </form>
      </>
    );
  }

  return (
    <>
      <header className="new-chat-screen-header">
        <h2 id="new-chat-title">{strings.chats.newChat.title}</h2>
        <span className="new-chat-screen-spacer" aria-hidden={true} />
         <PopupCloseButton ariaLabel={strings.chats.newChat.close} onClick={onClose} />
      </header>
      <PopupField label={strings.chats.searchPlaceholder} type="search" autoFocus placeholder={strings.chats.searchPlaceholder} value={memberSearch} onChange={(event) => onMemberSearchChange(event.target.value)} />
      <div className="new-chat-actions">
        {canManageSpaces && <button type="button" className="new-chat-action-row" onClick={() => onScreenChange("group")}>
          <span className="new-chat-action-icon" aria-hidden={true}>
            <span className="ms-icon ms-icon--22 ms-icon--filled">group</span>
          </span>
          <span className="new-chat-action-copy">
            <strong>{strings.chats.newChat.newGroup}</strong>
            <small>{strings.chats.newChat.groupHint}</small>
          </span>
          <span className="ms-icon ms-icon--20 new-chat-action-chevron" aria-hidden={true}>
            chevron_right
          </span>
        </button>}
        {canManageSpaces && <button type="button" className="new-chat-action-row" onClick={() => onScreenChange("channel")}>
          <span className="new-chat-action-icon new-chat-action-icon--channel" aria-hidden={true}>
            <span className="ms-icon ms-icon--22 ms-icon--filled">campaign</span>
          </span>
          <span className="new-chat-action-copy">
            <strong>{strings.chats.newChat.newChannel}</strong>
            <small>{strings.chats.newChat.channelHint}</small>
          </span>
          <span className="ms-icon ms-icon--20 new-chat-action-chevron" aria-hidden={true}>
            chevron_right
          </span>
        </button>}
        {canManageSpaces && <button type="button" className="new-chat-action-row" onClick={() => onScreenChange("voice")}>
          <span className="new-chat-action-icon new-chat-action-icon--voice" aria-hidden={true}>
            <span className="ms-icon ms-icon--22 ms-icon--filled">volume_up</span>
          </span>
          <span className="new-chat-action-copy">
            <strong>{strings.chats.newChat.newVoiceChannel}</strong>
            <small>{strings.chats.newChat.directMessageHint}</small>
          </span>
          <span className="ms-icon ms-icon--20 new-chat-action-chevron" aria-hidden={true}>
            chevron_right
          </span>
        </button>}
        {onPlanGuestMeeting && <button type="button" className="new-chat-action-row" onClick={onPlanGuestMeeting}>
          <span className="new-chat-action-icon" aria-hidden={true}><span className="ms-icon ms-icon--22 ms-icon--filled">calendar_add_on</span></span>
          <span className="new-chat-action-copy"><strong>{strings.chats.newChat.planGuestMeeting}</strong><small>{strings.chats.newChat.guestMeetingDescription}</small></span>
          <span className="ms-icon ms-icon--20 new-chat-action-chevron" aria-hidden={true}>chevron_right</span>
        </button>}
      </div>
      <p className="new-chat-section-label">{strings.chats.details.members}</p>
      <ul className="new-chat-contact-list">
        {members.length === 0 ? (
          <li className="new-chat-empty">{strings.chats.newChat.noContactsMatch}</li>
        ) : (
          members.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                className="new-chat-contact-row"
                onClick={() => onStartDirect(member.id)}
              >
                <RealAvatar
                  accessToken={accessToken}
                  className="avatar chat-avatar"
                  file={member.profilePhoto}
                  label={member.displayName}
                />
                <span className="new-chat-contact-copy">
                  <strong>{member.displayName}</strong>
                  {member.username ? <small>@{member.username}</small> : null}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </>
  );
}

