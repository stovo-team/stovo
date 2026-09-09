import { useEffect, useState } from "react";
import {
  AlertCircle,
  Compass,
  Headphones,
  Keyboard,
  MessageSquare,
  PenTool,
  RotateCcw,
  Search,
  Sparkles,
  X
} from "lucide-react";

import { useStrings } from "../../i18n/LanguageContext";
import {
  DEFAULT_SHORTCUT_BINDINGS,
  SHORTCUT_DEFINITIONS,
  checkShortcutConflict,
  formatKeyComboForDisplay,
  getBrowserShortcutConflict,
  isMacPlatform,
  normalizeKeyComboFromEvent
} from "../../shortcuts/registry";
import {
  loadShortcutBindings,
  resetAllShortcutBindings,
  resetShortcutBinding,
  saveShortcutBinding
} from "../../shortcuts/shortcutsStore";
import type {
  ShortcutActionId,
  ShortcutBindings,
  ShortcutCategory,
  ShortcutDefinition
} from "../../shortcuts/types";

export interface KeyboardShortcutsSettingsProps {
  showResetAll?: boolean;
}
export function KeyboardShortcutsSettings({ showResetAll = false }: KeyboardShortcutsSettingsProps = {}) {
  const strings = useStrings();
  const [bindings, setBindings] = useState<ShortcutBindings>(() => loadShortcutBindings());
  const [recordingActionId, setRecordingActionId] = useState<ShortcutActionId | null>(null);
  const [conflict, setConflict] = useState<{
    actionId: ShortcutActionId;
    conflictingActionId: ShortcutActionId;
    combo: string;
  } | null>(null);
  const [browserConflict, setBrowserConflict] = useState<{
    actionId: ShortcutActionId;
    browserFeature: string;
    combo: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const isMac = isMacPlatform();

  useEffect(() => {
    const handleChanged = (e?: Event) => {
      setBindings(loadShortcutBindings());
      setRecordingActionId(null);
      setConflict(null);
      setBrowserConflict(null);
      const detail = (e as CustomEvent<{ isResetAll?: boolean }>)?.detail;
      if (detail?.isResetAll) {
        setNotice(strings.shortcuts.resetAll);
        setTimeout(() => setNotice(null), 2500);
      }
    };
    window.addEventListener("stovo:shortcuts-changed", handleChanged);
    return () => {
      window.removeEventListener("stovo:shortcuts-changed", handleChanged);
    };
  }, [strings.shortcuts.resetAll]);

  // Handle keydown while in recording mode
  useEffect(() => {
    if (!recordingActionId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecordingActionId(null);
        setConflict(null);
        setBrowserConflict(null);
        return;
      }

      const combo = normalizeKeyComboFromEvent(event, isMac);
      if (!combo) {
        // Just pressed a modifier key like Shift or Ctrl
        return;
      }

      // Check browser reserved conflict
      const browserAction = getBrowserShortcutConflict(combo);
      if (browserAction) {
        setConflict(null);
        setBrowserConflict({
          actionId: recordingActionId,
          browserFeature: browserAction,
          combo
        });
        return;
      }

      // Check Stovo internal conflict
      const conflictingAction = checkShortcutConflict(recordingActionId, combo, bindings);
      if (conflictingAction) {
        setBrowserConflict(null);
        setConflict({
          actionId: recordingActionId,
          conflictingActionId: conflictingAction,
          combo
        });
        return;
      }

      // No conflict -> apply immediately
      const updated = saveShortcutBinding(recordingActionId, combo);
      setBindings(updated);
      setRecordingActionId(null);
      setConflict(null);
      setBrowserConflict(null);
      setNotice(`Shortcut updated: ${combo}`);
      setTimeout(() => setNotice(null), 2500);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [recordingActionId, bindings, isMac]);

  function handleReassignConflict() {
    if (!conflict) return;
    // Overwrite conflicting binding
    const updated = saveShortcutBinding(conflict.actionId, conflict.combo);
    setBindings(updated);
    setRecordingActionId(null);
    setConflict(null);
    setNotice(`Shortcut reassigned: ${conflict.combo}`);
    setTimeout(() => setNotice(null), 2500);
  }

  function handleResetOne(actionId: ShortcutActionId) {
    const updated = resetShortcutBinding(actionId);
    setBindings(updated);
    setConflict(null);
    setBrowserConflict(null);
  }

  function handleResetAll() {
    if (window.confirm(strings.shortcuts.resetConfirm)) {
      const updated = resetAllShortcutBindings();
      setBindings(updated);
      setRecordingActionId(null);
      setConflict(null);
      setBrowserConflict(null);
      setNotice(strings.shortcuts.resetAll);
      setTimeout(() => setNotice(null), 2500);
    }
  }

  const categoryGroups: Array<{
    category: ShortcutCategory;
    title: string;
    icon: typeof Keyboard;
    definitions: ShortcutDefinition[];
  }> = [
    {
      category: "general",
      title: strings.shortcuts.categories.general,
      icon: Sparkles,
      definitions: SHORTCUT_DEFINITIONS.filter((d) => d.category === "general")
    },
    {
      category: "navigation",
      title: strings.shortcuts.categories.navigation,
      icon: Compass,
      definitions: SHORTCUT_DEFINITIONS.filter((d) => d.category === "navigation")
    },
    {
      category: "chats",
      title: strings.shortcuts.categories.chats,
      icon: MessageSquare,
      definitions: SHORTCUT_DEFINITIONS.filter((d) => d.category === "chats")
    },
    {
      category: "composer",
      title: strings.shortcuts.categories.composer,
      icon: PenTool,
      definitions: SHORTCUT_DEFINITIONS.filter((d) => d.category === "composer")
    },
    {
      category: "calls",
      title: strings.shortcuts.categories.calls,
      icon: Headphones,
      definitions: SHORTCUT_DEFINITIONS.filter((d) => d.category === "calls")
    }
  ];

  const queryClean = searchQuery.trim().toLowerCase();
  const visibleGroups = categoryGroups
    .map((group) => ({
      ...group,
      definitions: group.definitions.filter((def) => {
        if (!queryClean) return true;
        const actionLabel = (strings.shortcuts.actions[def.id] || def.id).toLowerCase();
        const actionDesc = (
          (strings.shortcuts.actions as Record<string, string>)[`${def.id}_desc`] || ""
        ).toLowerCase();
        const currentBinding = (bindings[def.id] || def.defaultBinding).toLowerCase();
        return (
          actionLabel.includes(queryClean) ||
          actionDesc.includes(queryClean) ||
          currentBinding.includes(queryClean)
        );
      })
    }))
    .filter((group) => group.definitions.length > 0);
  return (
    <div className="shortcuts-settings-surface">
      {showResetAll && (
        <div className="shortcuts-settings-header">
          <div />
          <button
            type="button"
            className="secondary-button subtle-button shortcuts-reset-all-btn"
            onClick={handleResetAll}
          >
            <RotateCcw size={15} aria-hidden="true" />
            <span>{strings.shortcuts.resetAll}</span>
          </button>
        </div>
      )}

      {notice && <div className="shortcuts-settings-notice" role="status">{notice}</div>}

      <div className="shortcuts-search-container">
        <div className="shortcuts-search-bar">
          <Search size={16} className="shortcuts-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="shortcuts-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search shortcuts…"
            aria-label="Search shortcuts"
          />
          {searchQuery && (
            <button
              type="button"
              className="shortcuts-search-clear"
              aria-label="Clear search"
              onClick={() => setSearchQuery("")}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {browserConflict && (
        <div className="shortcuts-conflict-card" role="alert">
          <AlertCircle size={20} className="shortcuts-conflict-icon" aria-hidden="true" />
          <div className="shortcuts-conflict-body">
            <strong>{strings.shortcuts.browserConflictWarning}</strong>
            <p>
              Combination <kbd>{browserConflict.combo}</kbd> is reserved by your browser for &ldquo;{browserConflict.browserFeature}&rdquo;. Please choose a different shortcut.
            </p>
          </div>
          <div className="shortcuts-conflict-actions">
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() => {
                setBrowserConflict(null);
                setRecordingActionId(null);
              }}
            >
              {strings.shortcuts.cancel}
            </button>
          </div>
        </div>
      )}

      {conflict && (
        <div className="shortcuts-conflict-card" role="alert">
          <AlertCircle size={20} className="shortcuts-conflict-icon" aria-hidden="true" />
          <div className="shortcuts-conflict-body">
            <strong>{strings.shortcuts.conflictWarning}</strong>
            <p>
              Combination <kbd>{conflict.combo}</kbd> is currently assigned to{" "}
              <strong>{strings.shortcuts.actions[conflict.conflictingActionId]}</strong>.
            </p>
          </div>
          <div className="shortcuts-conflict-actions">
            <button
              type="button"
              className="primary-button small-button"
              onClick={handleReassignConflict}
            >
              {strings.shortcuts.reassign}
            </button>
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() => {
                setConflict(null);
                setRecordingActionId(null);
              }}
            >
              {strings.shortcuts.cancel}
            </button>
          </div>
        </div>
      )}

      {visibleGroups.length === 0 && searchQuery && (
        <div className="shortcuts-empty-state">
          <p className="muted-copy">No shortcuts match &ldquo;{searchQuery}&rdquo;</p>
        </div>
      )}

      {visibleGroups.map((group) => {
        const GroupIcon = group.icon;
        return (
          <section key={group.category} className="shortcuts-category-section">
            <h3 className="shortcuts-category-title">
              <GroupIcon size={18} aria-hidden="true" />
              <span>{group.title}</span>
            </h3>

            <div className="shortcuts-list">
              {group.definitions.map((def) => {
                const currentBinding = bindings[def.id] || def.defaultBinding;
                const isDefault = currentBinding === def.defaultBinding;
                const isRecording = recordingActionId === def.id;
                const displayKeys = formatKeyComboForDisplay(currentBinding, isMac);
                const actionLabel = strings.shortcuts.actions[def.id] || def.id;
                const actionDesc =
                  (strings.shortcuts.actions as Record<string, string>)[`${def.id}_desc`] || "";

                return (
                  <div
                    key={def.id}
                    className={`shortcut-row${isRecording ? " is-recording" : ""}`}
                  >
                    <div className="shortcut-row-info">
                      <strong className="shortcut-row-title">{actionLabel}</strong>
                      {actionDesc && (
                        <span className="shortcut-row-desc">{actionDesc}</span>
                      )}
                    </div>

                    <div className="shortcut-row-actions">
                      {isRecording ? (
                        <div className="shortcut-recording-indicator">
                          <span className="pulse-dot" aria-hidden="true" />
                          <span>{strings.shortcuts.pressKeys}</span>
                          <button
                            type="button"
                            className="shortcut-recording-close"
                            aria-label={strings.shortcuts.pressEscape}
                            title={strings.shortcuts.pressEscape}
                            onClick={() => {
                              setRecordingActionId(null);
                              setConflict(null);
                              setBrowserConflict(null);
                            }}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="shortcut-badge-button"
                          aria-label={`Change shortcut for ${actionLabel}`}
                          onClick={() => {
                            setConflict(null);
                            setBrowserConflict(null);
                            setRecordingActionId(def.id);
                          }}
                        >
                          {displayKeys.map((key, keyIndex) => (
                            <span key={keyIndex} className="shortcut-key-wrapper">
                              <kbd>{key}</kbd>
                              {keyIndex < displayKeys.length - 1 && (
                                <span className="shortcut-key-separator">+</span>
                              )}
                            </span>
                          ))}
                        </button>
                      )}

                      {!isDefault && !isRecording && (
                        <button
                          type="button"
                          className="shortcut-reset-button"
                          aria-label={`${strings.shortcuts.resetAction}: ${actionLabel}`}
                          title={strings.shortcuts.resetAction}
                          onClick={() => handleResetOne(def.id)}
                        >
                          <RotateCcw size={15} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
