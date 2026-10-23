import { useState } from "react";
import { CheckSquare, Circle, Mic, Plus, ShoppingCart, Trash2, Truck, X } from "lucide-react";
import { useStrings } from "../../i18n/LanguageContext";

export interface RichChecklistCreatorProps {
  onSubmit: (payload: {
    title: string;
    category: "grocery" | "errand" | "general";
    items: { text: string; section?: string }[];
  }) => Promise<void> | void;
  isSubmitting?: boolean;
  onCancel?: () => void;
}

interface ItemDraft {
  text: string;
  section?: string;
}

export function RichChecklistCreator({ onSubmit, isSubmitting = false, onCancel }: RichChecklistCreatorProps) {
  const copy = useStrings().attachments.checklistCreator;
  const [category, setCategory] = useState<"grocery" | "errand" | "general">("grocery");
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [newItemText, setNewItemText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSelectCategory = (newCat: "grocery" | "errand" | "general") => {
    setCategory(newCat);
    if (!title || title === copy.groceryTitle || title === copy.errandTitle || title === copy.todoTitle) {
      if (newCat === "grocery") {
        setTitle(copy.groceryTitle);
      } else if (newCat === "errand") {
        setTitle(copy.errandTitle);
      } else {
        setTitle(copy.todoTitle);
      }
    }
  };

  const handleAddItem = () => {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    setItems((prev) => [...prev, { text: trimmed }]);
    setNewItemText("");
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemTextChange = (index: number, text: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], text };
      return next;
    });
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    const defaultTitle = category === "grocery" ? copy.groceryTitle : category === "errand" ? copy.errandTitle : copy.todoTitle;
    const trimmedTitle = title.trim() || defaultTitle;
    const validItems = items.filter((i) => i.text.trim().length > 0);
    if (validItems.length === 0) {
      setErrorMsg(copy.emptyItems);
      return;
    }

    try {
      await onSubmit({
        title: trimmedTitle,
        category,
        items: validItems.map((item) => ({
          text: item.text.trim(),
          section: item.section?.trim() || undefined
        }))
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : copy.createFailed);
    }
  };

  const titlePlaceholder = category === "grocery" ? `e.g. ${copy.groceryTitle}` : category === "errand" ? `e.g. ${copy.errandTitle}` : `e.g. ${copy.todoTitle}`;

  return (
    <div className="rich-checklist-creator">
      <div className="rich-checklist-creator-header">
        <span className="checklist-creator-icon" aria-hidden="true">
          {category === "grocery" ? <ShoppingCart size={20} /> : category === "errand" ? <Truck size={20} /> : <CheckSquare size={20} />}
        </span>
        <h3>{copy.shared}</h3>
      </div>

      {errorMsg && <div className="checklist-creator-error-banner" role="alert">{errorMsg}</div>}

      <div className="checklist-creator-section">
        <label className="checklist-input-label">{copy.type}</label>
        <div className="checklist-category-selector" role="radiogroup" aria-label={copy.typeAria}>
          <button
            type="button"
            className={`checklist-cat-btn ${category === "grocery" ? "active" : ""}`}
            onClick={() => handleSelectCategory("grocery")}
            aria-pressed={category === "grocery"}
          >
            <ShoppingCart size={16} />
            <span>{copy.groceries}</span>
          </button>
          <button
            type="button"
            className={`checklist-cat-btn ${category === "errand" ? "active" : ""}`}
            onClick={() => handleSelectCategory("errand")}
            aria-pressed={category === "errand"}
          >
            <Truck size={16} />
            <span>{copy.errands}</span>
          </button>
          <button
            type="button"
            className={`checklist-cat-btn ${category === "general" ? "active" : ""}`}
            onClick={() => handleSelectCategory("general")}
            aria-pressed={category === "general"}
          >
            <CheckSquare size={16} />
            <span>{copy.taskList}</span>
          </button>
        </div>
      </div>

      <div className="checklist-creator-section">
        <label className="checklist-input-label" htmlFor="checklist-title-input">
          {copy.title}
        </label>
        <input
          id="checklist-title-input"
          type="text"
          className="checklist-text-input"
          placeholder={titlePlaceholder}
          value={title}
          maxLength={160}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="checklist-creator-section">
        <div className="checklist-items-header">
          <label className="checklist-input-label">{copy.items(items.length)}</label>
          <div className="checklist-items-header-actions">
            <button
              type="button"
              className="checklist-voice-btn"
              disabled
              title={copy.voiceFeature}
              aria-label={copy.voiceFeature}
            >
              <Mic size={14} />
              <span>{copy.voiceToList}</span>
              <span className="checklist-pro-badge">PRO</span>
            </button>
          </div>
        </div>

        <div className="checklist-items-list" role="list">
          {items.map((item, index) => (
            <div key={index} className="checklist-item-row" role="listitem">
              <Circle size={15} className="checklist-item-bullet-icon" aria-hidden="true" />
              <input
                type="text"
                className="checklist-item-input"
                value={item.text}
                placeholder={copy.itemName}
                maxLength={280}
                onChange={(e) => handleItemTextChange(index, e.target.value)}
              />
              {item.section && <span className="checklist-item-section-tag">{item.section}</span>}
              <button
                type="button"
                className="checklist-item-remove-btn"
                aria-label={copy.removeItem}
                onClick={() => handleRemoveItem(index)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        <div className="checklist-add-row">
          <input
            type="text"
            className="checklist-text-input checklist-quick-add"
            placeholder={copy.addItemPlaceholder}
            value={newItemText}
            maxLength={280}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddItem();
              }
            }}
          />
          <button
            type="button"
            className="checklist-add-btn"
            disabled={!newItemText.trim()}
            onClick={handleAddItem}
          >
            <Plus size={16} />
            <span>{copy.add}</span>
          </button>
        </div>
      </div>

      <div className="checklist-creator-actions">
        {onCancel && (
          <button type="button" className="checklist-action-btn secondary" onClick={onCancel} disabled={isSubmitting}>
            <X size={16} />
            <span>{copy.cancel}</span>
          </button>
        )}
        <button
          type="button"
          className="checklist-action-btn primary"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting || items.length === 0}
        >
          <Plus size={16} />
          <span>{isSubmitting ? copy.creating : copy.create}</span>
        </button>
      </div>
    </div>
  );
}
