import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useNavigate } from "react-router-dom";
import { getClusterPrefix } from "../api/client";
import { matchesKeyCombo } from "./registry";
import { loadShortcutBindings } from "./shortcutsStore";
import type { ShortcutActionId, ShortcutBindings } from "./types";

type ShortcutHandler = (event: KeyboardEvent) => boolean | void;

interface KeyboardShortcutsContextValue {
  bindings: ShortcutBindings;
  isQuickSwitcherOpen: boolean;
  openQuickSwitcher: () => void;
  closeQuickSwitcher: () => void;
  registerShortcutHandler: (actionId: ShortcutActionId, handler: ShortcutHandler) => () => void;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null);

function isInteractiveInputElement(el: Element | null): boolean {
  if (!el) return false;
  const tagName = el.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  if ((el as HTMLElement).isContentEditable) {
    return true;
  }
  return false;
}

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [bindings, setBindings] = useState<ShortcutBindings>(() => loadShortcutBindings());
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false);
  const handlersRef = useRef<Map<ShortcutActionId, Set<ShortcutHandler>>>(new Map());

  useEffect(() => {
    const handleStorage = () => {
      setBindings(loadShortcutBindings());
    };
    window.addEventListener("stovo:shortcuts-changed", handleStorage);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("stovo:shortcuts-changed", handleStorage);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const openQuickSwitcher = useCallback(() => {
    setIsQuickSwitcherOpen(true);
  }, []);

  const closeQuickSwitcher = useCallback(() => {
    setIsQuickSwitcherOpen(false);
  }, []);

  const registerShortcutHandler = useCallback((actionId: ShortcutActionId, handler: ShortcutHandler) => {
    let set = handlersRef.current.get(actionId);
    if (!set) {
      set = new Set();
      handlersRef.current.set(actionId, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
      if (set && set.size === 0) {
        handlersRef.current.delete(actionId);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // If repeat or default already prevented, ignore
      if (event.defaultPrevented) return;

      const activeEl = document.activeElement;
      const insideInput = isInteractiveInputElement(activeEl);

      // Check each configured binding
      for (const [actionKey, combo] of Object.entries(bindings)) {
        const actionId = actionKey as ShortcutActionId;
        if (!combo) continue;

        if (matchesKeyCombo(combo, event)) {
          // Determine whether this shortcut should fire inside an input
          const isGlobalOverlay = actionId === "quick_switcher" || actionId === "shortcuts_help";
          const isNavigation = actionId === "nav_chats" || actionId === "nav_files" || actionId === "nav_plans" || actionId === "nav_settings";

          // If inside input, only allow global overlays, navigation, and explicit search/call actions
          if (insideInput) {
            const allowedInInput =
              isGlobalOverlay ||
              isNavigation ||
              actionId === "search_messages" ||
              actionId === "toggle_call" ||
              actionId === "toggle_mute";

            if (!allowedInInput) {
              continue;
            }
          }

          // Built-in default handlers for global navigation & overlays
          if (actionId === "quick_switcher") {
            event.preventDefault();
            setIsQuickSwitcherOpen((prev) => !prev);
            return;
          }

          if (actionId === "shortcuts_help") {
            event.preventDefault();
            const prefix = getClusterPrefix();
            navigate(`${prefix}/app/settings`);
            return;
          }

          if (actionId === "nav_chats") {
            event.preventDefault();
            const prefix = getClusterPrefix();
            navigate(`${prefix}/app/chats`);
            return;
          }

          if (actionId === "nav_files") {
            event.preventDefault();
            const prefix = getClusterPrefix();
            navigate(`${prefix}/app/files`);
            return;
          }

          if (actionId === "nav_plans") {
            event.preventDefault();
            const prefix = getClusterPrefix();
            navigate(`${prefix}/app/plans`);
            return;
          }

          if (actionId === "nav_settings") {
            event.preventDefault();
            const prefix = getClusterPrefix();
            navigate(`${prefix}/app/settings`);
            return;
          }

          // Check registered custom handlers (e.g. from ChatsPage)
          const handlers = handlersRef.current.get(actionId);
          if (handlers && handlers.size > 0) {
            let handled = false;
            for (const handler of handlers) {
              const result = handler(event);
              if (result !== false) {
                handled = true;
              }
            }
            if (handled) {
              event.preventDefault();
              return;
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [bindings, navigate]);

  const value = useMemo<KeyboardShortcutsContextValue>(
    () => ({
      bindings,
      isQuickSwitcherOpen,
      openQuickSwitcher,
      closeQuickSwitcher,
      registerShortcutHandler
    }),
    [bindings, isQuickSwitcherOpen, openQuickSwitcher, closeQuickSwitcher, registerShortcutHandler]
  );

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}

export function useKeyboardShortcuts(): KeyboardShortcutsContextValue {
  const ctx = useContext(KeyboardShortcutsContext);
  if (!ctx) {
    throw new Error("useKeyboardShortcuts must be used within KeyboardShortcutsProvider");
  }
  return ctx;
}
