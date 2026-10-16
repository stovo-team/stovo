import { createPortal } from "react-dom";
import { Users } from "lucide-react";
import type { Poll, PollVoterSummary } from "../api/polls";
import { RealAvatar } from "../features/chats/sidebar/RealAvatar";
import { PopupDialog } from "./ui/Popup";
import { useStrings } from "../i18n/LanguageContext";

export interface PollVotersModalProps {
  accessToken?: string | null;
  open: boolean;
  onClose: () => void;
  poll: Poll;
  votersMap: Record<string, PollVoterSummary[]>;
  loading?: boolean;
}

export function PollVotersModal({ accessToken = null, open, onClose, poll, votersMap, loading = false }: PollVotersModalProps) {
  const copy = useStrings().auditUi;
  if (!open) return null;

  const content = (
    <PopupDialog className="poll-voters-modal" ariaLabel={copy.pollVoters} onClose={onClose} closeOnBackdrop size="md">
      <div className="modal-header">
        <div className="modal-title">
          <Users size={20} style={{ marginRight: 8 }} />
          <span>{copy.pollResultsVoters}</span>
        </div>
      </div>

      <div className="modal-body poll-voters-body">
        <div className="poll-voters-question">{poll.question}</div>

        {loading ? (
          <div className="poll-voters-loading">{copy.loadingVoters}</div>
        ) : (
          <div className="poll-voters-options-list">
            {poll.options.map((opt) => {
              const voters = votersMap[opt.id] || [];
              return (
                <div key={opt.id} className="poll-voters-option-group">
                  <div className="poll-voters-option-header">
                    <span className="poll-voters-option-text">{opt.text}</span>
                    <span className="poll-voters-option-count">{copy.voteCount(voters.length)}</span>
                  </div>

                  {voters.length === 0 ? (
                    <div className="poll-voters-empty">{copy.noVotesForOption}</div>
                  ) : (
                    <div className="poll-voters-user-list">
                      {voters.map((u) => (
                        <div key={u.id} className="poll-voter-user-item">
                          <RealAvatar accessToken={accessToken} className="avatar poll-voter-avatar" file={u.profilePhoto} label={u.displayName} />
                          <div className="poll-voter-names">
                            <span className="poll-voter-displayname">{u.displayName}</span>
                            <span className="poll-voter-username">@{u.username}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PopupDialog>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : content;
}
