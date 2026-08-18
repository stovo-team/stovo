import { FormEvent } from "react";

import type { User } from "../../../api/auth";
import type { NewChatScreen } from "../shared/types";
import { RealAvatar } from "./RealAvatar";

export function NewChatDialog({
  accessToken,
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
  onCreateChannel
}: {
  accessToken: string | null;
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
}) {
  const composeFormId = screen === "channel" ? "new-channel-form" : "new-group-form";
  const canCreateCompose = groupTitle.trim().length > 0;

  if (screen === "group" || screen === "channel") {
    const isChannel = screen === "channel";
    return (
      <section className="new-chat-screen" role="dialog" aria-modal="true" aria-labelledby="new-chat-compose-title">
        <header className="new-chat-screen-header">
          <button type="button" className="new-chat-screen-back" aria-label="Back" onClick={() => onScreenChange("pick")}>
            <span className="ms-icon ms-icon--24" aria-hidden={true}>
              arrow_back
            </span>
          </button>
          <h2 id="new-chat-compose-title">{isChannel ? "New channel" : "New group"}</h2>
          <button
            type="submit"
            form={composeFormId}
            className="new-chat-screen-action"
            disabled={!canCreateCompose}
            onClick={(event) => {
              event.preventDefault();
              if (isChannel) {
                onCreateChannel(event);
              } else {
                onCreateGroup(event);
              }
            }}
          >
            Create
          </button>
        </header>
        <form
          id={composeFormId}
          className="new-chat-compose"
          onSubmit={isChannel ? onCreateChannel : onCreateGroup}
        >
          <label className="new-chat-compose-title-field">
            <span>{isChannel ? "Channel name" : "Group name"}</span>
            <input
              autoFocus
              maxLength={255}
              placeholder={isChannel ? "Channel name" : "Group name"}
              value={groupTitle}
              onChange={(event) => onGroupTitleChange(event.target.value)}
            />
          </label>
          <label className="search-field new-chat-screen-search">
            <span className="ms-icon ms-icon--20" aria-hidden={true}>
              search
            </span>
            <input
              placeholder="Search members"
              value={memberSearch}
              onChange={(event) => onMemberSearchChange(event.target.value)}
            />
          </label>
          <p className="new-chat-section-label">Members</p>
          <ul className="new-chat-contact-list">
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
        </form>
      </section>
    );
  }

  return (
    <section className="new-chat-screen" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
      <header className="new-chat-screen-header">
        <button type="button" className="new-chat-screen-close" aria-label="Close new message" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <h2 id="new-chat-title">New Message</h2>
        <span className="new-chat-screen-spacer" aria-hidden={true} />
      </header>
      <label className="search-field new-chat-screen-search">
        <span className="ms-icon ms-icon--20" aria-hidden={true}>
          search
        </span>
        <input
          autoFocus
          placeholder="Search contacts"
          value={memberSearch}
          onChange={(event) => onMemberSearchChange(event.target.value)}
        />
      </label>
      <div className="new-chat-actions">
        <button type="button" className="new-chat-action-row" onClick={() => onScreenChange("group")}>
          <span className="new-chat-action-icon" aria-hidden={true}>
            <span className="ms-icon ms-icon--22 ms-icon--filled">group</span>
          </span>
          <span className="new-chat-action-copy">
            <strong>New Group</strong>
            <small>Chat with several family members</small>
          </span>
          <span className="ms-icon ms-icon--20 new-chat-action-chevron" aria-hidden={true}>
            chevron_right
          </span>
        </button>
        <button type="button" className="new-chat-action-row" onClick={() => onScreenChange("channel")}>
          <span className="new-chat-action-icon new-chat-action-icon--channel" aria-hidden={true}>
            <span className="ms-icon ms-icon--22 ms-icon--filled">campaign</span>
          </span>
          <span className="new-chat-action-copy">
            <strong>New Channel</strong>
            <small>Broadcast updates to members</small>
          </span>
          <span className="ms-icon ms-icon--20 new-chat-action-chevron" aria-hidden={true}>
            chevron_right
          </span>
        </button>
      </div>
      <p className="new-chat-section-label">Contacts</p>
      <ul className="new-chat-contact-list">
        {members.length === 0 ? (
          <li className="new-chat-empty">No contacts match your search.</li>
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
    </section>
  );
}
