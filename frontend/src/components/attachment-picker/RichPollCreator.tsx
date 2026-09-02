import { useState } from "react";
import { Plus, Trash2, HelpCircle, Check, Sparkles } from "lucide-react";
import type { CreatePollPayload } from "../../api/polls";

export interface RichPollCreatorProps {
  onSubmit: (payload: CreatePollPayload) => Promise<void> | void;
  isSubmitting?: boolean;
  onCancel?: () => void;
}

export function RichPollCreator({ onSubmit, isSubmitting = false, onCancel }: RichPollCreatorProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isQuiz, setIsQuiz] = useState(false);
  const [correctOptionIndex, setCorrectOptionIndex] = useState<number | null>(null);
  const [explanation, setExplanation] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddOption = () => {
    if (options.length >= 10) return;
    setOptions((prev) => [...prev, ""]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
    if (correctOptionIndex === index) {
      setCorrectOptionIndex(null);
    } else if (correctOptionIndex !== null && correctOptionIndex > index) {
      setCorrectOptionIndex(correctOptionIndex - 1);
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setErrorMsg("Please enter a question.");
      return;
    }

    const trimmedOptions = options.map((opt) => opt.trim());
    if (trimmedOptions.some((opt) => !opt)) {
      setErrorMsg("Please fill out all poll options.");
      return;
    }

    if (isQuiz && (correctOptionIndex === null || correctOptionIndex < 0 || correctOptionIndex >= options.length)) {
      setErrorMsg("Please select the correct answer for quiz mode.");
      return;
    }

    const payload: CreatePollPayload = {
      question: trimmedQuestion,
      options: trimmedOptions.map((text) => ({ text })),
      isAnonymous,
      allowMultiple: isQuiz ? false : allowMultiple, // Quiz mode is always single choice
      isQuiz,
      correctOptionIndex: isQuiz && correctOptionIndex !== null ? correctOptionIndex : undefined,
      explanation: isQuiz && explanation.trim() ? explanation.trim() : undefined,
    };

    try {
      await onSubmit(payload);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to create poll. Please try again.");
    }
  };

  return (
    <div className="rich-poll-creator">
      <div className="rich-poll-creator-header">
        <h3>New Poll</h3>
      </div>

      {errorMsg && <div className="poll-creator-error-banner" role="alert">{errorMsg}</div>}

      <div className="poll-creator-section">
        <label className="poll-input-label" htmlFor="poll-question-input">
          Question
        </label>
        <input
          id="poll-question-input"
          type="text"
          className="poll-text-input"
          placeholder="Ask a question..."
          value={question}
          maxLength={255}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={isSubmitting}
          autoFocus
        />
      </div>

      <div className="poll-creator-section">
        <div className="poll-input-label">Poll Options</div>
        <div className="poll-options-list">
          {options.map((optText, index) => (
            <div key={index} className="poll-option-row">
              {isQuiz && (
                <button
                  type="button"
                  className={`quiz-correct-toggle ${correctOptionIndex === index ? "is-correct" : ""}`}
                  title={correctOptionIndex === index ? "Correct answer" : "Mark as correct answer"}
                  aria-label={`Mark option ${index + 1} as correct answer`}
                  onClick={() => setCorrectOptionIndex(index)}
                >
                  <Check size={16} />
                </button>
              )}
              <input
                type="text"
                className="poll-text-input poll-option-input"
                placeholder={`Option ${index + 1}`}
                value={optText}
                maxLength={100}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                disabled={isSubmitting}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  className="poll-remove-option-btn"
                  aria-label={`Remove option ${index + 1}`}
                  onClick={() => handleRemoveOption(index)}
                  disabled={isSubmitting}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))}
        </div>

        {options.length < 10 && (
          <button
            type="button"
            className="poll-add-option-btn"
            onClick={handleAddOption}
            disabled={isSubmitting}
          >
            <Plus size={18} />
            <span>Add an Option</span>
          </button>
        )}
      </div>

      <div className="poll-creator-settings">
        <div className="poll-setting-row">
          <div className="poll-setting-info">
            <span className="poll-setting-title">Anonymous Voting</span>
            <span className="poll-setting-desc">Voters' identities will stay secret</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              disabled={isSubmitting}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {!isQuiz && (
          <div className="poll-setting-row">
            <div className="poll-setting-info">
              <span className="poll-setting-title">Multiple Answers</span>
              <span className="poll-setting-desc">Allow voters to choose more than one option</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={(e) => setAllowMultiple(e.target.checked)}
                disabled={isSubmitting}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        )}

        <div className="poll-setting-row">
          <div className="poll-setting-info">
            <span className="poll-setting-title">
              <Sparkles size={16} style={{ display: "inline", marginRight: 4 }} />
              Quiz Mode
            </span>
            <span className="poll-setting-desc">Polls have one correct answer and explanation</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isQuiz}
              onChange={(e) => {
                const checked = e.target.checked;
                setIsQuiz(checked);
                if (checked) {
                  setAllowMultiple(false);
                }
              }}
              disabled={isSubmitting}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {isQuiz && (
          <div className="poll-creator-section poll-explanation-section">
            <label className="poll-input-label" htmlFor="poll-explanation-input">
              <HelpCircle size={15} style={{ display: "inline", marginRight: 4 }} />
              Explanation (Optional)
            </label>
            <input
              id="poll-explanation-input"
              type="text"
              className="poll-text-input"
              placeholder="Explain why the answer is correct..."
              value={explanation}
              maxLength={200}
              onChange={(e) => setExplanation(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        )}
      </div>

      <div className="poll-creator-actions">
        {onCancel && (
          <button
            type="button"
            className="poll-cancel-btn"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className="poll-submit-btn"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create Poll"}
        </button>
      </div>
    </div>
  );
}
