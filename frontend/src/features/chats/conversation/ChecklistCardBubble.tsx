import { useEffect, useMemo, useState } from "react";
import { Check, CheckSquare, ChevronRight, LockKeyhole, Plus, ShoppingCart, Truck } from "lucide-react";
import type { ChecklistCard, ChecklistItem } from "../../../api/checklist";
import { addChecklistItem, toggleChecklistItem } from "../../../api/checklist";

export interface ChecklistCardBubbleProps {
  checklist: ChecklistCard;
  accessToken: string | null;
  currentUserId?: string;
  onOpenChecklist: () => void;
}

export function ChecklistCardBubble({
  checklist,
  accessToken,
  currentUserId,
  onOpenChecklist
}: ChecklistCardBubbleProps) {
  const [items, setItems] = useState<ChecklistItem[]>(checklist.items || []);
  const [newItemText, setNewItemText] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    setItems(checklist.items || []);
  }, [checklist.items]);

  const total = items.length;
  const completedCount = useMemo(() => items.filter((i) => i.completed).length, [items]);
  const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const handleToggle = async (itemId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!accessToken || !checklist.available) return;

    // Optimistic update
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              completed: !it.completed,
              completedBy: !it.completed ? currentUserId : undefined
            }
          : it
      )
    );

    try {
      await toggleChecklistItem(accessToken, checklist.id, itemId);
    } catch {
      // Revert on failure
      setItems(checklist.items || []);
    }
  };

  const handleAddItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = newItemText.trim();
    if (!text || !accessToken || !checklist.available || isAdding) return;

    setIsAdding(true);
    setNewItemText("");

    const tempId = `temp-${Date.now()}`;
    const optimisticItem: ChecklistItem = {
      id: tempId,
      checklistId: checklist.id,
      text,
      completed: false,
      position: items.length,
      createdBy: currentUserId || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setItems((prev) => [...prev, optimisticItem]);

    try {
      const created = await addChecklistItem(accessToken, checklist.id, { text });
      setItems((prev) => prev.map((it) => (it.id === tempId ? created : it)));
    } catch {
      setItems((prev) => prev.filter((it) => it.id !== tempId));
    } finally {
      setIsAdding(false);
    }
  };

  if (!checklist.available) {
    return (
      <div className="message-checklist-card message-checklist-card--unavailable" role="region" aria-label="Checklist">
        <span className="checklist-card-header-icon"><LockKeyhole size={20} /></span>
        <span className="checklist-card-title"><strong>Checklist unavailable</strong></span>
      </div>
    );
  }

  const categoryIcon = () => {
    switch (checklist.category) {
      case "grocery":
      case "groceries":
        return <ShoppingCart size={19} />;
      case "errand":
      case "errands":
        return <Truck size={19} />;
      default:
        return <CheckSquare size={19} />;
    }
  };

  const categoryLabel = () => {
    switch (checklist.category) {
      case "grocery":
      case "groceries":
        return "Groceries";
      case "errand":
      case "errands":
        return "Errands";
      default:
        return "Checklist";
    }
  };

  // Group items by section if any items have sections defined
  const hasSections = items.some((i) => Boolean(i.section));
  const sections = useMemo(() => {
    if (!hasSections) return null;
    const map = new Map<string, ChecklistItem[]>();
    items.forEach((item) => {
      const sec = item.section || "General";
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(item);
    });
    return Array.from(map.entries());
  }, [items, hasSections]);

  return (
    <div
      className={`message-checklist-card message-checklist-card--${checklist.category || "general"}`}
      role="region"
      aria-label={`${checklist.title} checklist`}
    >
      <header className="checklist-card-header">
        <div className="checklist-card-header-main">
          <span className="checklist-card-icon-badge" aria-hidden="true">
            {categoryIcon()}
          </span>
          <div className="checklist-card-title-wrap">
            <div className="checklist-card-category-tag">{categoryLabel()}</div>
            <strong className="checklist-card-title">{checklist.title}</strong>
          </div>
        </div>
        <button
          type="button"
          className="checklist-card-open-btn"
          aria-label={`Open ${checklist.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenChecklist();
          }}
        >
          <span>Open</span>
          <ChevronRight size={16} />
        </button>
      </header>

      <div className="checklist-card-progress-wrap">
        <div className="checklist-card-progress-bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
          <div className="checklist-card-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="checklist-card-progress-label">
          <span>{completedCount} of {total} completed</span>
          <span>{progressPct}%</span>
        </div>
      </div>

      <div className="checklist-card-items-container">
        {hasSections && sections ? (
          sections.map(([sectionName, sectionItems]) => (
            <div key={sectionName} className="checklist-card-section-group">
              <h4 className="checklist-card-section-title">{sectionName}</h4>
              <ul className="checklist-card-items-list" role="list">
                {sectionItems.map((item) => (
                  <ChecklistCardItemRow
                    key={item.id}
                    item={item}
                    onToggle={(e) => void handleToggle(item.id, e)}
                  />
                ))}
              </ul>
            </div>
          ))
        ) : (
          <ul className="checklist-card-items-list" role="list">
            {items.map((item) => (
              <ChecklistCardItemRow
                key={item.id}
                item={item}
                onToggle={(e) => void handleToggle(item.id, e)}
              />
            ))}
          </ul>
        )}
      </div>

      <form
        className="checklist-card-quick-add"
        onSubmit={(e) => void handleAddItem(e)}
        onClick={(e) => e.stopPropagation()}
      >
        <Plus size={14} className="checklist-quick-add-bullet" aria-hidden="true" />
        <input
          type="text"
          className="checklist-card-add-input"
          placeholder="+ Add item..."
          value={newItemText}
          maxLength={280}
          onChange={(e) => setNewItemText(e.target.value)}
          disabled={isAdding}
        />
        {newItemText.trim().length > 0 && (
          <button
            type="submit"
            className="checklist-card-add-submit"
            aria-label="Add item to checklist"
            disabled={isAdding}
          >
            <Plus size={16} />
          </button>
        )}
      </form>
    </div>
  );
}

function ChecklistCardItemRow({
  item,
  onToggle
}: {
  item: ChecklistItem;
  onToggle: (event: React.MouseEvent) => void;
}) {
  return (
    <li
      className={`checklist-card-item ${item.completed ? "is-completed" : ""}`}
      role="listitem"
      onClick={onToggle}
    >
      <button
        type="button"
        className={`checklist-card-checkbox ${item.completed ? "checked" : ""}`}
        aria-checked={item.completed}
        role="checkbox"
        aria-label={`Mark "${item.text}" as ${item.completed ? "incomplete" : "complete"}`}
        onClick={onToggle}
      >
        {item.completed && <Check size={13} strokeWidth={3} />}
      </button>
      <span className="checklist-card-item-text">
        {item.text}
      </span>
    </li>
  );
}
