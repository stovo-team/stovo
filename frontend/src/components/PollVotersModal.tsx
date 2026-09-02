import { createPortal } from "react-dom";
import { X, Users } from "lucide-react";
import type { Poll, PollVoterSummary } from "../api/polls";

export interface PollVotersModalProps {
  open: boolean;
  onClose: () => void;
  poll: Poll;
  votersMap: Record<string, PollVoterSummary[]>;
  loading?: boolean;
}

export function PollVotersModal({ open, onClose, poll, votersMap, loading = false }: PollVotersModalProps) {
  if (!open) return null;

  const content = (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog poll-voters-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Poll Voters"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">
            <Users size={20} style={{ marginRight: 8 }} />
            <span>Poll Results & Voters</span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body poll-voters-body">
          <div className="poll-voters-question">{poll.question}</div>

          {loading ? (
            <div className="poll-voters-loading">Loading voters...</div>
          ) : (
            <div className="poll-voters-options-list">
              {poll.options.map((opt) => {
                const voters = votersMap[opt.id] || [];
                return (
                  <div key={opt.id} className="poll-voters-option-group">
                    <div className="poll-voters-option-header">
                      <span className="poll-voters-option-text">{opt.text}</span>
                      <span className="poll-voters-option-count">
                        {voters.length} {voters.length === 1 ? "vote" : "votes"}
                      </span>
                    </div>

                    {voters.length === 0 ? (
                      <div className="poll-voters-empty">No votes for this option yet.</div>
                    ) : (
                      <div className="poll-voters-user-list">
                        {voters.map((u) => (
                          <div key={u.id} className="poll-voter-user-item">
                            <div className="poll-voter-avatar">
                              {u.profilePhoto?.fileUrl ? (
                                <img src={u.profilePhoto.fileUrl} alt={u.displayName} />
                              ) : (
                                <span>{u.displayName.charAt(0).toUpperCase()}</span>
                              )}
                            </div>
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
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : content;
}
