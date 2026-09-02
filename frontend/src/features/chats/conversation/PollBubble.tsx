import { useState } from "react";
import { Check, X, Lock, Users, BarChart2, CheckCircle2, HelpCircle } from "lucide-react";
import type { Poll, PollOption } from "../../../api/polls";

export interface PollBubbleProps {
  poll: Poll;
  currentUserId: string;
  onVote: (pollId: string, optionIds: string[]) => Promise<void> | void;
  onClosePoll?: (pollId: string) => Promise<void> | void;
  onViewVoters?: (poll: Poll) => void;
  canClosePoll?: boolean;
}

export function PollBubble({
  poll,
  currentUserId,
  onVote,
  onClosePoll,
  onViewVoters,
  canClosePoll = false,
}: PollBubbleProps) {
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(() =>
    poll.options.filter((o) => o.voted).map((o) => o.id)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const hasVoted = poll.options.some((o) => o.voted);
  const showResults = hasVoted || poll.isClosed;

  const handleOptionClick = async (optionId: string) => {
    if (poll.isClosed || isSubmitting) return;

    if (poll.allowMultiple) {
      setSelectedOptionIds((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
      );
    } else {
      // Single choice: instant vote or switch option
      const newSelection = selectedOptionIds.includes(optionId) ? [] : [optionId];
      setSelectedOptionIds(newSelection);
      setIsSubmitting(true);
      try {
        await onVote(poll.id, newSelection);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleSubmitMultiVote = async () => {
    if (poll.isClosed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onVote(poll.id, selectedOptionIds);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetractVote = async () => {
    if (poll.isClosed || isSubmitting) return;
    setSelectedOptionIds([]);
    setIsSubmitting(true);
    try {
      await onVote(poll.id, []);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = async () => {
    if (isClosing) return;
    setIsClosing(true);
    try {
      await onClosePoll?.(poll.id);
    } finally {
      setIsClosing(false);
    }
  };

  const getOptionPercentage = (opt: PollOption) => {
    if (poll.totalVoters === 0) return 0;
    return Math.round((opt.voteCount / poll.totalVoters) * 100);
  };

  return (
    <div className={`poll-bubble-card ${poll.isClosed ? "is-closed" : ""} ${poll.isQuiz ? "is-quiz" : ""}`}>
      <div className="poll-header">
        <div className="poll-title-row">
          <BarChart2 className="poll-icon" size={20} />
          <span className="poll-question">{poll.question}</span>
        </div>
        <div className="poll-badges">
          {poll.isAnonymous ? (
            <span className="poll-badge" title="Anonymous Poll">
              <Lock size={12} /> Anonymous
            </span>
          ) : (
            <span className="poll-badge" title="Public Poll">
              <Users size={12} /> Public
            </span>
          )}
          {poll.allowMultiple && <span className="poll-badge">Multiple Choice</span>}
          {poll.isQuiz && <span className="poll-badge quiz-badge">Quiz</span>}
          {poll.isClosed && <span className="poll-badge closed-badge">Closed</span>}
        </div>
      </div>

      <div className="poll-options-container">
        {poll.options.map((opt) => {
          const percentage = getOptionPercentage(opt);
          const isSelectedLocally = selectedOptionIds.includes(opt.id);
          const isCorrect = poll.isQuiz && poll.correctOptionId === opt.id;
          const isWrongPick = poll.isQuiz && opt.voted && !isCorrect;

          let optionClassName = "poll-option-item";
          if (showResults) optionClassName += " show-results";
          if (opt.voted) optionClassName += " is-voted";
          if (isSelectedLocally) optionClassName += " is-selected";
          if (showResults && isCorrect) optionClassName += " is-quiz-correct";
          if (showResults && isWrongPick) optionClassName += " is-quiz-wrong";

          return (
            <button
              key={opt.id}
              type="button"
              className={optionClassName}
              onClick={() => void handleOptionClick(opt.id)}
              disabled={poll.isClosed || isSubmitting}
            >
              {showResults && (
                <div
                  className="poll-option-fill-bar"
                  style={{ width: `${percentage}%` }}
                />
              )}

              <div className="poll-option-content">
                <div className="poll-option-left">
                  {!poll.isClosed && (
                    <div
                      className={`poll-control ${poll.allowMultiple ? "checkbox" : "radio"} ${
                        isSelectedLocally ? "checked" : ""
                      }`}
                    >
                      {isSelectedLocally && (poll.allowMultiple ? <Check size={12} /> : <div className="radio-dot" />)}
                    </div>
                  )}

                  {showResults && isCorrect && <CheckCircle2 size={16} className="quiz-icon-correct" />}
                  {showResults && isWrongPick && <X size={16} className="quiz-icon-wrong" />}

                  <span className="poll-option-text">{opt.text}</span>
                </div>

                <div className="poll-option-right">
                  {showResults && (
                    <span className="poll-option-percent">
                      {percentage}%
                    </span>
                  )}
                  {opt.voted && <Check size={16} className="poll-user-voted-icon" title="You voted for this option" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {poll.isQuiz && showResults && poll.explanation && (
        <div className="poll-quiz-explanation">
          <HelpCircle size={15} />
          <span>{poll.explanation}</span>
        </div>
      )}

      <div className="poll-footer">
        <div className="poll-footer-stats">
          <span>
            {poll.totalVoters} {poll.totalVoters === 1 ? "vote" : "votes"}
          </span>
          {!poll.isAnonymous && poll.totalVoters > 0 && onViewVoters && (
            <>
              <span className="bullet-sep">•</span>
              <button
                type="button"
                className="poll-view-voters-btn"
                onClick={() => onViewVoters(poll)}
              >
                View Voters
              </button>
            </>
          )}
        </div>

        <div className="poll-footer-actions">
          {poll.allowMultiple && !poll.isClosed && (
            <button
              type="button"
              className="poll-action-btn submit-btn"
              onClick={() => void handleSubmitMultiVote()}
              disabled={isSubmitting}
            >
              Submit Vote
            </button>
          )}

          {hasVoted && !poll.isClosed && (
            <button
              type="button"
              className="poll-action-btn retract-btn"
              onClick={() => void handleRetractVote()}
              disabled={isSubmitting}
            >
              Retract Vote
            </button>
          )}

          {canClosePoll && !poll.isClosed && onClosePoll && (
            <button
              type="button"
              className="poll-action-btn close-poll-btn"
              onClick={() => void handleClose()}
              disabled={isClosing}
            >
              {isClosing ? "Closing..." : "Close Poll"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
