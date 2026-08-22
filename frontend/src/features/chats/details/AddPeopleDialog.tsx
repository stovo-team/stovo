import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import type { User } from "../../../api/auth";
import { useStrings } from "../../../i18n/LanguageContext";
import { RealAvatar } from "../sidebar/RealAvatar";

type AddPeopleDialogProps = {
  accessToken: string | null;
  members: User[];
  onAdd: (userId: string) => Promise<void>;
  onClose: () => void;
};

export function AddPeopleDialog({ accessToken, members, onAdd, onClose }: AddPeopleDialogProps) {
  const strings = useStrings();
  const [search, setSearch] = useState("");
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) =>
      `${member.displayName} ${member.username ?? ""}`.toLowerCase().includes(query)
    );
  }, [members, search]);

  async function handleAdd(userId: string) {
    setAddingUserId(userId);
    try {
      await onAdd(userId);
      onClose();
    } catch {
      // The parent surfaces the API error and leaves the picker open for retry.
    } finally {
      setAddingUserId(null);
    }
  }

  return createPortal(
    <div className="new-chat-modal-backdrop" onMouseDown={onClose}>
      <div onMouseDown={(event) => event.stopPropagation()}>
        <section className="new-chat-screen" aria-modal="true" aria-labelledby="add-people-title" role="dialog">
          <header className="new-chat-screen-header">
            <span className="new-chat-screen-spacer" />
            <h2 id="add-people-title">{strings.chats.details.addPeople}</h2>
            <button
              type="button"
              className="new-chat-screen-close"
              aria-label={strings.chats.details.cancel}
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </button>
          </header>
          <input
            autoFocus
            className="new-chat-screen-search"
            type="search"
            value={search}
            placeholder={strings.chats.details.addPeopleSearchPlaceholder}
            onChange={(event) => setSearch(event.target.value)}
          />
          <p className="new-chat-section-label">{strings.chats.details.members}</p>
          <ul className="new-chat-contact-list">
            {filteredMembers.length === 0 ? (
              <li className="new-chat-empty">{strings.chats.details.noPeopleToAdd}</li>
            ) : (
              filteredMembers.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    className="new-chat-contact-row"
                    disabled={addingUserId !== null}
                    onClick={() => void handleAdd(member.id)}
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
      </div>
    </div>,
    document.body
  );
}
