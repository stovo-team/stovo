import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import {
  Check,
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Forward,
  Pencil,
  ShoppingBag,
  ShoppingCart,
  ListTodo,
  FolderPlus,
  Mic
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { getSocketConfigForUrl } from "../api/serverRegistry";
import { getApiUrl } from "../api/client";
import {
  getChecklist,
  renameChecklist,
  updateChecklistCategory,
  toggleChecklistItem,
  deleteChecklistItem,
  batchSyncChecklistItems,
  linkChecklist,
  type Checklist,
  type ChecklistItem
} from "../api/checklist";
import type { Chat } from "../api/chats";
import { getChats } from "../api/chats";
import { ForwardChatDialog } from "../features/chats/conversation/MessageDialogs";
import { BackButton } from "../components/BackButton";
import AppNav from "./AppNav";

const GROCERY_TEMPLATES = [
  { section: "Produce", items: ["Apples", "Bananas", "Spinach", "Avocados", "Tomatoes"] },
  { section: "Dairy & Eggs", items: ["Milk", "Eggs", "Greek Yogurt", "Butter", "Cheese"] },
  { section: "Bakery & Pantry", items: ["Sourdough Bread", "Pasta", "Olive Oil", "Coffee Beans"] },
  { section: "Meat & Seafood", items: ["Chicken Breast", "Salmon Fillet"] }
];

const ERRAND_TEMPLATES = [
  { section: "Post Office", items: ["Drop off return package", "Buy stamps"] },
  { section: "Pharmacy", items: ["Pick up prescription", "Vitamins"] },
  { section: "Hardware / Home", items: ["Light bulbs", "Air filters"] },
  { section: "Dry Cleaner", items: ["Drop off coats", "Pick up shirts"] }
];

export default function ChecklistPage() {
  const { checklistId = "" } = useParams();
  const navigate = useNavigate();
  const { accessToken, currentUser } = useAuth();

  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [shareOpen, setShareOpen] = useState(false);
  const [forwardChatIds, setForwardChatIds] = useState<string[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);

  const [newSectionDraft, setNewSectionDraft] = useState("");
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [extraSections, setExtraSections] = useState<string[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const batchTimerRef = useRef<number | null>(null);

  // Load checklist and set up socket
  useEffect(() => {
    if (!accessToken || !checklistId) return;
    let cancelled = false;

    const connect = async () => {
      try {
        const loadedChecklist = await getChecklist(accessToken, checklistId);
        if (cancelled) return;
        setChecklist(loadedChecklist);
        setItems(loadedChecklist.items || []);

        const socketConfig = getSocketConfigForUrl(getApiUrl());
        const socket = io(socketConfig.origin, {
          path: socketConfig.path,
          auth: { token: accessToken },
          query: { token: accessToken },
          transports: ["websocket", "polling"]
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          socket.emit("checklist:join", { checklistId });
        });

        socket.on("checklist:update", (updated: Checklist) => {
          if (updated.id === checklistId) {
            setChecklist(updated);
            setItems(updated.items || []);
          }
        });

        socket.on("checklist:error", (payload: { checklistId?: string; message?: string }) => {
          if (payload.checklistId === checklistId) {
            setError(payload.message ?? "Checklist is unavailable");
          }
        });
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not open Checklist");
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (batchTimerRef.current !== null) {
        window.clearTimeout(batchTimerRef.current);
      }
      if (socketRef.current) {
        socketRef.current.emit("checklist:leave", { checklistId });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [accessToken, checklistId]);

  // Load chats for forward dialog
  useEffect(() => {
    if (!accessToken || !shareOpen) return;
    void getChats(accessToken).then(setChats).catch(() => undefined);
  }, [accessToken, shareOpen]);

  // Save title
  const saveTitle = async () => {
    if (!checklist || !accessToken) return;
    const title = titleDraft.trim();
    setIsEditingTitle(false);
    if (!title || title === checklist.title) return;
    try {
      const updated = await renameChecklist(accessToken, checklist.id, title);
      setChecklist(updated);
    } catch {
      // restore
    }
  };

  // Change category
  const changeCategory = async (cat: string) => {
    if (!checklist || !accessToken) return;
    try {
      const updated = await updateChecklistCategory(accessToken, checklist.id, cat);
      setChecklist(updated);
    } catch {
      // ignore
    }
  };

  // Toggle item
  const handleToggleItem = async (itemId: string, currentCompleted: boolean) => {
    if (!accessToken || !checklist) return;
    const nextCompleted = !currentCompleted;

    // Optimistic local update
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, completed: nextCompleted } : it))
    );
    setChecklist((prev) =>
      prev
        ? {
            ...prev,
            completedItems: nextCompleted
              ? prev.completedItems + 1
              : Math.max(0, prev.completedItems - 1)
          }
        : null
    );

    try {
      const updated = await toggleChecklistItem(accessToken, checklist.id, itemId);
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      // Revert on error
      const restored = await getChecklist(accessToken, checklist.id).catch(() => null);
      if (restored) {
        setChecklist(restored);
        setItems(restored.items || []);
      }
    }
  };

  // Debounced sync for item edits
  const scheduleBatchSync = (newItems: ChecklistItem[]) => {
    if (batchTimerRef.current !== null) {
      window.clearTimeout(batchTimerRef.current);
    }
    batchTimerRef.current = window.setTimeout(async () => {
      if (!accessToken || !checklist) return;
      try {
        const payload = newItems
          .filter((it) => it.text.trim() !== "")
          .map((it, idx) => ({
            id: it.id.startsWith("temp_") ? undefined : it.id,
            text: it.text.trim(),
            completed: it.completed,
            position: idx + 1,
            section: it.section
          }));
        if (payload.length === 0 && newItems.length > 0) {
          return;
        }
        const updated = await batchSyncChecklistItems(accessToken, checklist.id, payload);
        setChecklist(updated);
        setItems((currentItems) => {
          const activeDrafts = currentItems.filter(
            (it) => it.id.startsWith("temp_") && !it.text.trim()
          );
          if (activeDrafts.length === 0) {
            return updated.items || [];
          }
          return [...(updated.items || []), ...activeDrafts];
        });
      } catch {
        // keep local state
      }
    }, 400);
  };

  // Change item text with Notion shortcuts
  const handleItemTextChange = (itemId: string, newText: string) => {
    let text = newText;
    let sectionChange: string | undefined = undefined;

    // Notion markdown heading shortcut (# Heading or ## Heading)
    const headingMatch = /^(#{1,3})\s+(.*)$/u.exec(text);
    if (headingMatch) {
      sectionChange = headingMatch[2].trim();
      text = "";
    }

    // Strip Notion to-do prefixes if typed
    if (text.startsWith("[] ") || text.startsWith("[ ] ") || text.startsWith("- [ ] ")) {
      text = text.replace(/^(\[\]|\[ \]|-\s+\[ \])\s*/u, "");
    }

    const updated = items.map((it) => {
      if (it.id !== itemId) return it;
      return {
        ...it,
        text,
        section: sectionChange !== undefined ? sectionChange : it.section
      };
    });

    setItems(updated);
    scheduleBatchSync(updated);
  };

  // Key navigation and enter-to-add
  const handleKeyDown = async (
    event: React.KeyboardEvent<HTMLInputElement>,
    itemId: string,
    currentSection?: string
  ) => {
    const currentIndex = items.findIndex((it) => it.id === itemId);

    if (event.key === "Enter") {
      event.preventDefault();
      // Add a new task item immediately below
      const tempId = `temp_${Date.now()}`;
      const newItem: ChecklistItem = {
        id: tempId,
        checklistId: checklist?.id || "",
        text: "",
        completed: false,
        position: currentIndex + 2,
        section: currentSection || "",
        createdBy: currentUser?.id || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const next = [...items];
      next.splice(currentIndex + 1, 0, newItem);
      // Re-index positions
      const reindexed = next.map((it, idx) => ({ ...it, position: idx + 1 }));
      setItems(reindexed);
      scheduleBatchSync(reindexed);

      // Focus new input on next tick
      setTimeout(() => {
        const input = inputRefs.current.get(tempId);
        input?.focus();
      }, 50);
    } else if (event.key === "Backspace") {
      const currentItem = items[currentIndex];
      if (currentItem && !currentItem.text) {
        event.preventDefault();
        // Delete this empty item
        handleDeleteItem(itemId);
        // Focus previous input
        if (currentIndex > 0) {
          const prevItem = items[currentIndex - 1];
          setTimeout(() => {
            const input = inputRefs.current.get(prevItem.id);
            input?.focus();
          }, 50);
        }
      }
    } else if (event.key === "ArrowUp" && currentIndex > 0) {
      event.preventDefault();
      const prevItem = items[currentIndex - 1];
      inputRefs.current.get(prevItem.id)?.focus();
    } else if (event.key === "ArrowDown" && currentIndex < items.length - 1) {
      event.preventDefault();
      const nextItem = items[currentIndex + 1];
      inputRefs.current.get(nextItem.id)?.focus();
    }
  };

  // Delete item
  const handleDeleteItem = async (itemId: string) => {
    const remaining = items.filter((it) => it.id !== itemId);
    setItems(remaining);
    setChecklist((prev) =>
      prev
        ? {
            ...prev,
            totalItems: Math.max(0, prev.totalItems - 1),
            completedItems: items.find((it) => it.id === itemId)?.completed
              ? Math.max(0, prev.completedItems - 1)
              : prev.completedItems
          }
        : null
    );

    if (!itemId.startsWith("temp_") && accessToken && checklist) {
      try {
        await deleteChecklistItem(accessToken, checklist.id, itemId);
      } catch {
        // ignore
      }
    } else {
      scheduleBatchSync(remaining);
    }
  };

  // Add new item to a section
  const handleAddItemToSection = async (section = "") => {
    if (!checklist) return;
    const id = `temp_${Date.now()}`;
    const now = new Date().toISOString();
    const newItem: ChecklistItem = {
      id,
      checklistId: checklist.id,
      text: "",
      completed: false,
      position: items.length + 1,
      section,
      createdBy: currentUser?.id || "",
      createdAt: now,
      updatedAt: now
    };
    setItems((prev) => [...prev, newItem]);
    setChecklist((prev) => (prev ? { ...prev, totalItems: prev.totalItems + 1 } : prev));
    setTimeout(() => {
      inputRefs.current.get(id)?.focus();
    }, 50);
  };

  // Add section
  const handleCreateSection = () => {
    const sec = newSectionDraft.trim();
    if (!sec) return;
    setIsAddingSection(false);
    setNewSectionDraft("");
    setExtraSections((prev) => (prev.includes(sec) ? prev : [...prev, sec]));
    void handleAddItemToSection(sec);
  };

  // Apply templates
  const handleApplyTemplates = async (templates: typeof GROCERY_TEMPLATES) => {
    if (!accessToken || !checklist) return;
    const itemsToAdd: Array<{ text: string; section: string; position: number }> = [];
    let pos = items.length + 1;
    for (const group of templates) {
      for (const t of group.items) {
        itemsToAdd.push({
          text: t,
          section: group.section,
          position: pos++
        });
      }
    }
    const payload = [
      ...items.map((it, idx) => ({
        id: it.id,
        text: it.text,
        completed: it.completed,
        position: idx + 1,
        section: it.section
      })),
      ...itemsToAdd.map((it) => ({
        text: it.text,
        completed: false,
        position: it.position,
        section: it.section
      }))
    ];
    try {
      const updated = await batchSyncChecklistItems(accessToken, checklist.id, payload);
      setChecklist(updated);
      setItems(updated.items || []);
    } catch {
      // ignore
    }
  };

  // Forward checklist to chats
  const toggleForwardChat = (chatId: string) => {
    setForwardChatIds((current) =>
      current.includes(chatId) ? current.filter((id) => id !== chatId) : [...current, chatId]
    );
  };

  const forwardChecklist = async () => {
    if (!accessToken || !checklist || !forwardChatIds.length) return;
    try {
      let updated = checklist;
      for (const chatId of forwardChatIds) {
        updated = await linkChecklist(accessToken, checklist.id, chatId);
      }
      const destination = forwardChatIds.length === 1 ? forwardChatIds[0] : null;
      setChecklist(updated);
      setForwardChatIds([]);
      setShareOpen(false);
      if (destination) navigate(`/app/chats/${destination}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not forward Checklist");
    }
  };

  if (error) {
    return (
      <main className="app-shell app-frame checklist-page-frame">
        <AppNav />
        <section className="page-surface checklist-page-surface checklist-page-surface--error">
          <header className="checklist-page-header">
            <BackButton ariaLabel="Back" title="Back" onClick={() => navigate(-1)} />
            <h1>Checklist unavailable</h1>
          </header>
          <p className="checklist-error-text">{error}</p>
        </section>
      </main>
    );
  }

  if (!checklist) {
    return (
      <main className="app-shell app-frame checklist-page-frame">
        <AppNav />
        <section className="page-surface checklist-page-surface checklist-page-surface--loading">
          <p className="checklist-loading-text">Opening Checklist…</p>
        </section>
      </main>
    );
  }

  // Group items by section
  const sectionsMap = new Map<string, ChecklistItem[]>();
  extraSections.forEach((sec) => {
    const sTrim = sec.trim();
    if (sTrim && !sectionsMap.has(sTrim)) {
      sectionsMap.set(sTrim, []);
    }
  });
  items.forEach((it) => {
    const sec = it.section?.trim() || "";
    if (!sectionsMap.has(sec)) {
      sectionsMap.set(sec, []);
    }
    sectionsMap.get(sec)!.push(it);
  });

  const totalCount = items.length;
  const completedCount = items.filter((it) => it.completed).length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <main className="app-shell app-frame checklist-page-frame">
      <AppNav />
      <section className="page-surface checklist-page-surface">
        <header className="checklist-page-header">
          <BackButton ariaLabel="Back" title="Back" onClick={() => navigate(-1)} />

          <div className="checklist-header-info">
            <div className="checklist-title-group">
              {isEditingTitle ? (
                <input
                  className="checklist-title-input"
                  aria-label="Checklist title"
                  autoFocus
                  maxLength={160}
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => void saveTitle()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void saveTitle();
                    }
                    if (event.key === "Escape") {
                      setIsEditingTitle(false);
                    }
                  }}
                />
              ) : (
                <h1>{checklist.title}</h1>
              )}
              {checklist.canManage && !isEditingTitle && (
                <button
                  type="button"
                  className="checklist-title-edit"
                  aria-label="Edit checklist title"
                  title="Edit checklist title"
                  onClick={() => {
                    setTitleDraft(checklist.title);
                    setIsEditingTitle(true);
                  }}
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>

            <div className="checklist-category-pills">
              <button
                type="button"
                className={`checklist-cat-pill ${checklist.category === "groceries" || checklist.category === "grocery" ? "active" : ""}`}
                onClick={() => void changeCategory("groceries")}
              >
                <ShoppingCart size={14} />
                <span>Groceries</span>
              </button>
              <button
                type="button"
                className={`checklist-cat-pill ${checklist.category === "errands" || checklist.category === "errand" ? "active" : ""}`}
                onClick={() => void changeCategory("errands")}
              >
                <ShoppingBag size={14} />
                <span>Errands</span>
              </button>
              <button
                type="button"
                className={`checklist-cat-pill ${checklist.category === "general" || !checklist.category ? "active" : ""}`}
                onClick={() => void changeCategory("general")}
              >
                <ListTodo size={14} />
                <span>General</span>
              </button>
            </div>
          </div>

          <div className="checklist-page-actions">
            {checklist.canManage && (
              <button
                type="button"
                className="checklist-icon-action"
                aria-label="Share checklist in chat"
                title="Share checklist in chat"
                onClick={() => {
                  setForwardChatIds([]);
                  setShareOpen((prev) => !prev);
                }}
              >
                <Forward size={18} />
              </button>
            )}
          </div>
        </header>

      {shareOpen && checklist.canManage && (
        <ForwardChatDialog
          title="Share Checklist in Chat"
          accessToken={accessToken}
          currentUserId={currentUser?.id}
          chats={chats}
          selectedChatIds={forwardChatIds}
          onToggle={toggleForwardChat}
          onForward={() => void forwardChecklist()}
          onClose={() => {
            setForwardChatIds([]);
            setShareOpen(false);
          }}
        />
      )}

      {/* Progress & stats banner */}
      <div className="checklist-progress-container">
        <div className="checklist-progress-meta">
          <span className="checklist-progress-stat">
            <strong>{completedCount}</strong> of <strong>{totalCount}</strong> items completed
          </span>
          <span className="checklist-progress-percent">{progressPercent}%</span>
        </div>
        <div className="checklist-progress-track">
          <div
            className="checklist-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Notion-style task list editor */}
      <div className="checklist-workspace">
        {Array.from(sectionsMap.entries()).map(([sectionName, sectionItems]) => (
          <section key={sectionName || "__unsectioned__"} className="checklist-section-block">
            {sectionName ? (
              <header className="checklist-section-header">
                <span className="checklist-section-title">{sectionName}</span>
                <span className="checklist-section-count">{sectionItems.length} items</span>
              </header>
            ) : null}

            <div className="checklist-section-items">
              {sectionItems.map((item) => (
                <div
                  key={item.id}
                  className={`checklist-item-row ${item.completed ? "completed" : ""}`}
                >
                  <button
                    type="button"
                    className={`checklist-item-check-btn ${item.completed ? "checked" : ""}`}
                    aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
                    onClick={() => void handleToggleItem(item.id, item.completed)}
                  >
                    {item.completed && <Check size={12} strokeWidth={3} className="icon-checked" />}
                  </button>

                  <input
                    ref={(el) => {
                      if (el) inputRefs.current.set(item.id, el);
                      else inputRefs.current.delete(item.id);
                    }}
                    type="text"
                    className="checklist-item-text-input"
                    value={item.text}
                    placeholder="To-do item (type # for section heading)..."
                    onChange={(e) => handleItemTextChange(item.id, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, item.id, item.section)}
                  />

                  <button
                    type="button"
                    className="checklist-item-delete-btn"
                    aria-label="Delete item"
                    title="Delete item"
                    onClick={() => void handleDeleteItem(item.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="checklist-add-item-btn"
              onClick={() => void handleAddItemToSection(sectionName)}
            >
              <Plus size={15} />
              <span>Add item</span>
            </button>
          </section>
        ))}

        {/* Action bar to add new section or templates */}
        <div className="checklist-footer-actions">
          {isAddingSection ? (
            <div className="checklist-new-section-form">
              <input
                type="text"
                className="checklist-new-section-input"
                autoFocus
                placeholder="Section name (e.g. Dairy, Bakery, Pharmacy)..."
                value={newSectionDraft}
                onChange={(e) => setNewSectionDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateSection();
                  }
                  if (e.key === "Escape") setIsAddingSection(false);
                }}
              />
              <button
                type="button"
                className="checklist-btn-primary"
                onClick={handleCreateSection}
                disabled={!newSectionDraft.trim()}
              >
                Add Section
              </button>
              <button
                type="button"
                className="checklist-btn-secondary"
                onClick={() => setIsAddingSection(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="checklist-action-buttons">
              <button
                type="button"
                className="checklist-action-pill"
                onClick={() => void handleAddItemToSection("")}
              >
                <Plus size={15} />
                <span>Add Task</span>
              </button>

              <button
                type="button"
                className="checklist-action-pill"
                onClick={() => setIsAddingSection(true)}
              >
                <FolderPlus size={15} />
                <span>Add Section</span>
              </button>

              <button
                type="button"
                className="checklist-action-pill checklist-action-pill--disabled"
                disabled
                title="Dictate list via voice (Premium feature)"
                aria-label="Dictate list via voice (Premium feature)"
              >
                <Mic size={15} />
                <span>Voice List</span>
                <span className="checklist-pro-badge">PRO</span>
              </button>

              {items.length === 0 && checklist.category === "groceries" && (
                <button
                  type="button"
                  className="checklist-action-pill highlight"
                  onClick={() => void handleApplyTemplates(GROCERY_TEMPLATES)}
                >
                  <ShoppingCart size={15} />
                  <span>Insert Grocery Pack</span>
                </button>
              )}

              {items.length === 0 && checklist.category === "errands" && (
                <button
                  type="button"
                  className="checklist-action-pill highlight"
                  onClick={() => void handleApplyTemplates(ERRAND_TEMPLATES)}
                >
                  <ShoppingBag size={15} />
                  <span>Insert Errand Pack</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      </section>
    </main>
  );
}
