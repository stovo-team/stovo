import { useState } from "react";
import { CheckSquare, Circle, Mic, Plus, ShoppingBag, ShoppingCart, Sparkles, Trash2, Truck } from "lucide-react";

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

const GROCERY_TEMPLATE: ItemDraft[] = [
  { text: "Apples & Bananas", section: "Produce" },
  { text: "Spinach & Avocados", section: "Produce" },
  { text: "Whole Milk & Butter", section: "Dairy" },
  { text: "Free-range Eggs", section: "Dairy" },
  { text: "Sourdough Bread", section: "Bakery" },
  { text: "Olive Oil & Sea Salt", section: "Pantry" }
];

const ERRAND_TEMPLATE: ItemDraft[] = [
  { text: "Pick up prescription", section: "Pharmacy" },
  { text: "Drop off return package", section: "Post Office" },
  { text: "Pick up dry cleaning", section: "Cleaners" },
  { text: "Buy AA batteries & lightbulbs", section: "Hardware" }
];

export function RichChecklistCreator({ onSubmit, isSubmitting = false, onCancel }: RichChecklistCreatorProps) {
  const [category, setCategory] = useState<"grocery" | "errand" | "general">("grocery");
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [newItemText, setNewItemText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSelectCategory = (newCat: "grocery" | "errand" | "general") => {
    setCategory(newCat);
    if (!title || title === "Grocery list" || title === "Weekend Errands" || title === "To-Do List") {
      if (newCat === "grocery") {
        setTitle("Grocery list");
      } else if (newCat === "errand") {
        setTitle("Weekend Errands");
      } else {
        setTitle("To-Do List");
      }
    }
  };

  const handleApplyTemplate = (template: ItemDraft[]) => {
    setItems([...template]);
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
    const defaultTitle = category === "grocery" ? "Grocery list" : category === "errand" ? "Weekend Errands" : "To-Do List";
    const trimmedTitle = title.trim() || defaultTitle;
    const validItems = items.filter((i) => i.text.trim().length > 0);
    if (validItems.length === 0) {
      setErrorMsg("Please add at least one item to the checklist.");
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
      setErrorMsg(err instanceof Error ? err.message : "Failed to create checklist.");
    }
  };

  const titlePlaceholder = category === "grocery" ? "e.g. Grocery list" : category === "errand" ? "e.g. Weekend Errands" : "e.g. To-Do List";

  return (
    <div className="rich-checklist-creator">
      <div className="rich-checklist-creator-header">
        <span className="checklist-creator-icon" aria-hidden="true">
          {category === "grocery" ? <ShoppingCart size={20} /> : category === "errand" ? <Truck size={20} /> : <CheckSquare size={20} />}
        </span>
        <h3>Shared Checklist</h3>
      </div>

      {errorMsg && <div className="checklist-creator-error-banner" role="alert">{errorMsg}</div>}

      <div className="checklist-creator-section">
        <label className="checklist-input-label">Checklist Type</label>
        <div className="checklist-category-selector" role="radiogroup" aria-label="Checklist type">
          <button
            type="button"
            className={`checklist-cat-btn ${category === "grocery" ? "active" : ""}`}
            onClick={() => handleSelectCategory("grocery")}
            aria-pressed={category === "grocery"}
          >
            <ShoppingCart size={16} />
            <span>Groceries</span>
          </button>
          <button
            type="button"
            className={`checklist-cat-btn ${category === "errand" ? "active" : ""}`}
            onClick={() => handleSelectCategory("errand")}
            aria-pressed={category === "errand"}
          >
            <Truck size={16} />
            <span>Errands</span>
          </button>
          <button
            type="button"
            className={`checklist-cat-btn ${category === "general" ? "active" : ""}`}
            onClick={() => handleSelectCategory("general")}
            aria-pressed={category === "general"}
          >
            <CheckSquare size={16} />
            <span>Task List</span>
          </button>
        </div>
      </div>

      <div className="checklist-creator-section">
        <label className="checklist-input-label" htmlFor="checklist-title-input">
          Title
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
          <label className="checklist-input-label">Items ({items.length})</label>
          <div className="checklist-items-header-actions">
            <button
              type="button"
              className="checklist-voice-btn"
              disabled
              title="Voice checklist creation (Premium feature)"
              aria-label="Voice checklist creation (Premium feature)"
            >
              <Mic size={14} />
              <span>Voice to List</span>
              <span className="checklist-pro-badge">PRO</span>
            </button>
            {category === "grocery" && (
              <button
                type="button"
                className="checklist-template-btn"
                onClick={() => handleApplyTemplate(GROCERY_TEMPLATE)}
              >
                <Sparkles size={14} />
                <span>Load Grocery Pack</span>
              </button>
            )}
            {category === "errand" && (
              <button
                type="button"
                className="checklist-template-btn"
                onClick={() => handleApplyTemplate(ERRAND_TEMPLATE)}
              >
                <Sparkles size={14} />
                <span>Load Errand Pack</span>
              </button>
            )}
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
                placeholder="Item name"
                maxLength={280}
                onChange={(e) => handleItemTextChange(index, e.target.value)}
              />
              {item.section && <span className="checklist-item-section-tag">{item.section}</span>}
              <button
                type="button"
                className="checklist-item-remove-btn"
                aria-label="Remove item"
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
            placeholder="+ Add an item and press Enter..."
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
            className="checklist-mic-btn"
            disabled
            title="Dictate item by voice (Premium feature)"
            aria-label="Dictate item by voice (Premium feature)"
          >
            <Mic size={16} />
          </button>
          <button
            type="button"
            className="checklist-add-btn"
            disabled={!newItemText.trim()}
            onClick={handleAddItem}
          >
            <Plus size={16} />
            <span>Add</span>
          </button>
        </div>
      </div>

      <div className="checklist-creator-actions">
        {onCancel && (
          <button type="button" className="checklist-action-btn secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="checklist-action-btn primary"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting || items.length === 0}
        >
          {isSubmitting ? "Creating..." : "Share Checklist in Chat"}
        </button>
      </div>
    </div>
  );
}
