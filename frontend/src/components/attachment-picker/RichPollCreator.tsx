import { useState } from "react";
import { BarChart3, Check, CircleHelp, ListChecks, Plus, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import type { CreatePollPayload } from "../../api/polls";
import { useStrings } from "../../i18n/LanguageContext";

export interface RichPollCreatorProps {
  onSubmit: (payload: CreatePollPayload) => Promise<void> | void;
  isSubmitting?: boolean;
  onCancel?: () => void;
}

export function RichPollCreator({ onSubmit, isSubmitting = false, onCancel }: RichPollCreatorProps) {
  const copy = useStrings().attachments.pollCreator;
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
      setErrorMsg(copy.emptyQuestion);
      return;
    }

    const trimmedOptions = options.map((opt) => opt.trim());
    if (trimmedOptions.some((opt) => !opt)) {
      setErrorMsg(copy.emptyOptions);
      return;
    }

    if (isQuiz && (correctOptionIndex === null || correctOptionIndex < 0 || correctOptionIndex >= options.length)) {
      setErrorMsg(copy.missingAnswer);
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
      setErrorMsg(err?.message || copy.createFailed);
    }
  };

  return (
    <div className="rich-poll-creator">
      <div className="rich-poll-creator-header">
        <span className="poll-creator-title-icon" aria-hidden="true"><BarChart3 size={18} /></span>
        <div>
          <h3>{copy.title}</h3>
          <p>{copy.subtitle}</p>
        </div>
      </div>

      {errorMsg && <div className="poll-creator-error-banner" role="alert">{errorMsg}</div>}

      <div className="poll-creator-section">
        <label className="poll-input-label" htmlFor="poll-question-input">
          {copy.question}
        </label>
        <input
          id="poll-question-input"
          type="text"
          className="poll-text-input"
          placeholder={copy.questionPlaceholder}
          value={question}
          maxLength={255}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={isSubmitting}
          autoFocus
        />
      </div>

      <div className="poll-creator-section">
        <div className="poll-input-label poll-options-label">{copy.options}</div>
        <div className="poll-options-list">
          {options.map((optText, index) => (
            <div key={index} className="poll-option-row">
              {isQuiz && (
                <button
                  type="button"
                  className={`quiz-correct-toggle ${correctOptionIndex === index ? "is-correct" : ""}`}
                  title={correctOptionIndex === index ? copy.correctAnswer : copy.markCorrect}
                  aria-label={copy.markOptionCorrect(index + 1)}
                  onClick={() => setCorrectOptionIndex(index)}
                >
                  <Check size={16} />
                </button>
              )}
              <input
                type="text"
                className="poll-text-input poll-option-input"
                placeholder={copy.option(index + 1)}
                value={optText}
                maxLength={100}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                disabled={isSubmitting}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  className="poll-remove-option-btn"
                  aria-label={copy.removeOption(index + 1)}
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
            <span>{copy.addOption}</span>
          </button>
        )}
      </div>

      <div className="poll-creator-settings">
        <div className="poll-setting-row">
          <span className="poll-setting-icon" aria-hidden="true"><ShieldCheck size={18} /></span>
          <div className="poll-setting-info">
            <span className="poll-setting-title">{copy.anonymous}</span>
            <span className="poll-setting-desc">{copy.keepPrivate}</span>
          </div>
          <label className="poll-setting-toggle" aria-label={copy.anonymousVoting}>
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
            <span className="poll-setting-title">{copy.multipleAnswers}</span>
            <span className="poll-setting-desc">{copy.multipleAnswersHelp}</span>
            </div>
            <label className="poll-setting-toggle" aria-label={copy.allowMultipleAnswers}>
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
            <span className="poll-setting-title">{copy.quiz}</span>
            <span className="poll-setting-desc">{copy.quizHelp}</span>
          </div>
          <label className="poll-setting-toggle" aria-label={copy.quizMode}>
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
              {copy.explanation} <span>({copy.optional})</span>
            </label>
            <input
              id="poll-explanation-input"
              type="text"
              className="poll-text-input"
              placeholder={copy.explanationPlaceholder}
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
            {copy.cancel}
          </button>
        )}
        <button
          type="button"
          className="poll-submit-btn"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting}
        >
          <BarChart3 size={17} aria-hidden="true" />
          {isSubmitting ? copy.creating : copy.create}
        </button>
      </div>
    </div>
  );
}
