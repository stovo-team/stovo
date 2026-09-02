import { useState } from "react";
import { BarChart3, Check, CircleHelp, ListChecks, Plus, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
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
        <span className="poll-creator-title-icon" aria-hidden="true"><BarChart3 size={18} /></span>
        <div>
          <h3>New poll</h3>
          <p>Ask the chat a question</p>
        </div>
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
        <div className="poll-input-label poll-options-label">Options</div>
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
            <span>Add option</span>
          </button>
        )}
      </div>

      <div className="poll-creator-settings">
        <div className="poll-setting-row">
          <span className="poll-setting-icon" aria-hidden="true"><ShieldCheck size={18} /></span>
          <div className="poll-setting-info">
            <span className="poll-setting-title">Anonymous</span>
            <span className="poll-setting-desc">Keep voters private</span>
          </div>
          <label className="poll-setting-toggle" aria-label="Anonymous voting">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              disabled={isSubmitting}
            />
            <span className="poll-setting-toggle-track"><span><Check size={12} strokeWidth={3} /></span></span>
          </label>
        </div>

        {!isQuiz && (
          <div className="poll-setting-row">
            <span className="poll-setting-icon" aria-hidden="true"><ListChecks size={18} /></span>
            <div className="poll-setting-info">
              <span className="poll-setting-title">Multiple answers</span>
              <span className="poll-setting-desc">Let voters choose more than one</span>
            </div>
            <label className="poll-setting-toggle" aria-label="Allow multiple answers">
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={(e) => setAllowMultiple(e.target.checked)}
                disabled={isSubmitting}
              />
              <span className="poll-setting-toggle-track"><span><Check size={12} strokeWidth={3} /></span></span>
            </label>
          </div>
        )}

        <div className="poll-setting-row">
          <span className="poll-setting-icon" aria-hidden="true"><Sparkles size={18} /></span>
          <div className="poll-setting-info">
            <span className="poll-setting-title">Quiz</span>
            <span className="poll-setting-desc">Choose one correct answer</span>
          </div>
          <label className="poll-setting-toggle" aria-label="Quiz mode">
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
            <span className="poll-setting-toggle-track"><span><Check size={12} strokeWidth={3} /></span></span>
          </label>
        </div>

        {isQuiz && (
          <div className="poll-creator-section poll-explanation-section">
            <label className="poll-input-label" htmlFor="poll-explanation-input">
              <CircleHelp size={15} aria-hidden="true" />
              Explanation <span>(optional)</span>
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
            <X size={17} aria-hidden="true" />
            Cancel
          </button>
        )}
        <button
          type="button"
          className="poll-submit-btn"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting}
        >
          <BarChart3 size={17} aria-hidden="true" />
          {isSubmitting ? "Creating…" : "Create poll"}
        </button>
      </div>
    </div>
  );
}
