import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CornerDownLeft,
  Folder,
  Hash,
  Keyboard,
  LogOut,
  MessageCircle,
  Moon,
  PlusCircle,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Volume2,
  X
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { useAppearance } from "../appearance/AppearanceContext";
import { useStrings } from "../i18n/LanguageContext";
import { getClusterPrefix } from "../api/client";
import {
  createDirectChat,
  getChats,
  type Chat
} from "../api/chats";
import { getMembers } from "../api/family";
import type { User } from "../api/auth";
import { displayChatName } from "../features/chats/shared/chatPresentation";
import { SettingsAvatar } from "../pages/settings/SettingsAvatar";

export interface QuickSwitcherItem {
  id: string;
  type: "channel" | "dm" | "user" | "action";
  title: string;
  subtitle?: string;
  badge?: string;
  icon?: typeof Hash;
  chat?: Chat;
  user?: User;
  avatarFile?: import("../api/files").FamilyFile | null;
  onSelect: () => void | Promise<void>;
}

interface QuickSwitcherModalProps {
  open: boolean;
  onClose: () => void;
}

export function QuickSwitcherModal({ open, onClose }: QuickSwitcherModalProps) {
  const navigate = useNavigate();
  const strings = useStrings();
  const { accessToken, currentUser, logout } = useAuth();
  const { appearance, setAppearance } = useAppearance();

  const [query, setQuery] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsListRef = useRef<HTMLUListElement | null>(null);

  const prefix = getClusterPrefix();

  // Load chats & members when opened
  useEffect(() => {
    if (!open || !accessToken) {
      setQuery("");
      setSelectedIndex(0);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      getChats(accessToken).catch(() => []),
      getMembers(accessToken).catch(() => [])
    ]).then(([loadedChats, loadedMembers]) => {
      if (!cancelled) {
        setChats(loadedChats);
        setMembers(loadedMembers);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, accessToken]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [open]);

  // Actions list
  const actions = useMemo<QuickSwitcherItem[]>(() => {
    const isDark = appearance.themeMode === "dark";
    const canViewAdmin = currentUser?.role === "owner" || Boolean(currentUser?.permissions?.length);

    const list: QuickSwitcherItem[] = [
      {
        id: "action-nav-chats",
        type: "action",
        title: strings.quickSwitcher.actionNavChats,
        subtitle: `${prefix}/app/chats`,
        icon: MessageCircle,
        onSelect: () => {
          onClose();
          navigate(`${prefix}/app/chats`);
        }
      },
      {
        id: "action-nav-files",
        type: "action",
        title: strings.quickSwitcher.actionNavFiles,
        subtitle: `${prefix}/app/files`,
        icon: Folder,
        onSelect: () => {
          onClose();
          navigate(`${prefix}/app/files`);
        }
      },
      {
        id: "action-nav-plans",
        type: "action",
        title: strings.quickSwitcher.actionNavPlans,
        subtitle: `${prefix}/app/plans`,
        icon: CalendarDays,
        onSelect: () => {
          onClose();
          navigate(`${prefix}/app/plans`);
        }
      },
      {
        id: "action-nav-settings",
        type: "action",
        title: strings.quickSwitcher.actionNavSettings,
        subtitle: `${prefix}/app/settings`,
        icon: Settings,
        onSelect: () => {
          onClose();
          navigate(`${prefix}/app/settings`);
        }
      },
      {
        id: "action-shortcuts",
        type: "action",
        title: strings.quickSwitcher.actionShortcuts,
        subtitle: strings.shortcuts.actions.shortcuts_help_desc,
        icon: Keyboard,
        onSelect: () => {
          onClose();
          window.dispatchEvent(new CustomEvent("stovo:open-shortcuts-settings"));
          navigate(`${prefix}/app/settings?section=shortcuts`);
        }
      },
      {
        id: "action-toggle-theme",
        type: "action",
        title: strings.quickSwitcher.actionToggleTheme,
        subtitle: isDark ? "Switch to Light theme" : "Switch to Dark theme",
        icon: isDark ? Sun : Moon,
        onSelect: () => {
          onClose();
          setAppearance({ ...appearance, themeMode: isDark ? "light" : "dark" });
        }
      }
    ];

    if (canViewAdmin) {
      list.push({
        id: "action-nav-admin",
        type: "action",
        title: strings.quickSwitcher.actionNavAdmin,
        subtitle: `${prefix}/app/admin`,
        icon: ShieldCheck,
        onSelect: () => {
          onClose();
          navigate(`${prefix}/app/admin`);
        }
      });
    }

    list.push({
      id: "action-logout",
      type: "action",
      title: strings.quickSwitcher.actionLogOut,
      icon: LogOut,
      onSelect: () => {
        onClose();
        void logout();
      }
    });

    return list;
  }, [appearance, setAppearance, currentUser, navigate, onClose, prefix, strings, logout]);

  // Compute filtered items
  const filteredItems = useMemo<QuickSwitcherItem[]>(() => {
    const raw = query.trim();
    const isChannelFilter = raw.startsWith("#");
    const isUserFilter = raw.startsWith("@");
    const isActionFilter = raw.startsWith(">") || raw.startsWith("/");

    const cleanQuery = (isChannelFilter || isUserFilter || isActionFilter ? raw.slice(1) : raw).trim().toLowerCase();

    const items: QuickSwitcherItem[] = [];

    // 1. Channels & Groups
    if (!isUserFilter && !isActionFilter) {
      const channelChats = chats.filter((c) => c.type === "channel" || c.type === "group" || c.type === "family" || c.type === "voice");
      for (const chat of channelChats) {
        const title = displayChatName(chat, currentUser?.id, strings);
        if (!cleanQuery || title.toLowerCase().includes(cleanQuery)) {
          const isVoice = chat.type === "voice";
          const isGroup = chat.type === "group" || chat.type === "family";
          items.push({
            id: `chat-${chat.id}`,
            type: "channel",
            title,
            subtitle: isVoice ? strings.quickSwitcher.badgeVoice : isGroup ? `${chat.members.length} members` : strings.quickSwitcher.badgeChannel,
            badge: isVoice ? strings.quickSwitcher.badgeVoice : isGroup ? strings.quickSwitcher.badgeGroup : strings.quickSwitcher.badgeChannel,
            icon: isVoice ? Volume2 : isGroup ? Users : Hash,
            chat,
            onSelect: () => {
              onClose();
              navigate(`${prefix}/app/chats/${chat.id}`);
            }
          });
        }
      }
    }

    // 2. Direct Messages
    if (!isChannelFilter && !isActionFilter) {
      const dmChats = chats.filter((c) => c.type === "direct");
      for (const chat of dmChats) {
        const title = displayChatName(chat, currentUser?.id, strings);
        const other = chat.members.find((m) => m.id !== currentUser?.id);
        if (!cleanQuery || title.toLowerCase().includes(cleanQuery) || (other?.username && other.username.toLowerCase().includes(cleanQuery))) {
          items.push({
            id: `chat-${chat.id}`,
            type: "dm",
            title,
            subtitle: other?.isOnline ? "Online" : other?.username ? `@${other.username}` : undefined,
            avatarFile: other?.profilePhoto ?? null,
            chat,
            onSelect: () => {
              onClose();
              navigate(`${prefix}/app/chats/${chat.id}`);
            }
          });
        }
      }
    }

    // 3. Other People / Users without an open DM
    if (!isChannelFilter && !isActionFilter) {
      const existingDmUserIds = new Set(
        chats.filter((c) => c.type === "direct").flatMap((c) => c.members.map((m) => m.id))
      );

      const otherMembers = members.filter(
        (m) => m.id !== currentUser?.id && !existingDmUserIds.has(m.id)
      );

      for (const member of otherMembers) {
        const name = member.displayName || member.username;
        if (!cleanQuery || name.toLowerCase().includes(cleanQuery) || member.username.toLowerCase().includes(cleanQuery)) {
          items.push({
            id: `user-${member.id}`,
            type: "user",
            title: member.displayName,
            subtitle: member.username ? `@${member.username}` : member.role,
            avatarFile: member.profilePhoto ?? null,
            user: member,
            onSelect: async () => {
              onClose();
              if (accessToken) {
                try {
                  const created = await createDirectChat(accessToken, member.id);
                  navigate(`${prefix}/app/chats/${created.id}`);
                } catch {
                  navigate(`${prefix}/app/chats`);
                }
              }
            }
          });
        }
      }
    }

    // 4. Actions & Commands
    if (!isChannelFilter && !isUserFilter) {
      for (const action of actions) {
        if (!cleanQuery || action.title.toLowerCase().includes(cleanQuery) || (action.subtitle && action.subtitle.toLowerCase().includes(cleanQuery))) {
          items.push(action);
        }
      }
    }

    return items;
  }, [chats, members, actions, query, currentUser?.id, strings, onClose, navigate, prefix, accessToken]);

  // Keep selected index in range
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (filteredItems.length === 0) return 0;
      if (prev >= filteredItems.length) return filteredItems.length - 1;
      return prev;
    });
  }, [filteredItems.length]);

  // Scroll active item into view
  useEffect(() => {
    if (!resultsListRef.current) return;
    const selectedEl = resultsListRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedEl && typeof (selectedEl as HTMLElement).scrollIntoView === "function") {
      (selectedEl as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length === 0 ? 0 : (prev + 1) % filteredItems.length));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length === 0 ? 0 : (prev - 1 + filteredItems.length) % filteredItems.length));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const currentItem = filteredItems[selectedIndex];
      if (currentItem) {
        void currentItem.onSelect();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
  };

  if (!open) return null;

  return (
    <div
      className="messenger-modal-backdrop quick-switcher-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="messenger-modal quick-switcher-modal"
        role="dialog"
        aria-modal="true"
        aria-label={strings.shortcuts.actions.quick_switcher}
        onKeyDown={handleKeyDown}
      >
        <div className="quick-switcher-search-row">
          <div className="quick-switcher-search-bar">
            <Search className="quick-switcher-search-icon" aria-hidden="true" size={20} />
            <input
              ref={inputRef}
              type="text"
              className="quick-switcher-input"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder={strings.quickSwitcher.placeholder}
              aria-label={strings.quickSwitcher.placeholder}
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                className="quick-switcher-clear-button"
                aria-label={strings.sharedUi.clearSearch}
                onClick={() => {
                  setQuery("");
                  setSelectedIndex(0);
                  inputRef.current?.focus();
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            type="button"
            className="quick-switcher-close-button"
            aria-label={strings.quickSwitcher.hintClose}
            title={strings.quickSwitcher.hintClose}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="quick-switcher-content">
          {filteredItems.length === 0 ? (
            <div className="quick-switcher-empty">
              <p>{strings.quickSwitcher.noResults}</p>
            </div>
          ) : (
            <ul className="quick-switcher-list" ref={resultsListRef} role="listbox">
              {filteredItems.map((item, index) => {
                const isSelected = index === selectedIndex;
                const Icon = item.icon;

                return (
                  <li
                    key={item.id}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    className={`quick-switcher-item${isSelected ? " is-selected" : ""}`}
                    onClick={() => void item.onSelect()}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="quick-switcher-item-leading">
                      {item.avatarFile !== undefined ? (
                        <SettingsAvatar
                          accessToken={accessToken}
                          file={item.avatarFile}
                          label={item.title}
                          size="default"
                        />
                      ) : Icon ? (
                        <div className="quick-switcher-icon-wrap">
                          <Icon size={20} aria-hidden="true" />
                        </div>
                      ) : (
                        <div className="quick-switcher-icon-wrap">
                          <Hash size={20} aria-hidden="true" />
                        </div>
                      )}
                    </div>

                    <div className="quick-switcher-item-body">
                      <span className="quick-switcher-item-title">{item.title}</span>
                      {item.subtitle && (
                        <span className="quick-switcher-item-subtitle">{item.subtitle}</span>
                      )}
                    </div>

                    {item.badge && (
                      <span className="quick-switcher-item-badge">{item.badge}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="quick-switcher-footer">
          <div className="quick-switcher-footer-hints">
            <span>
              <kbd><ArrowUp size={12} aria-hidden="true" /></kbd>
              <kbd><ArrowDown size={12} aria-hidden="true" /></kbd>
              {" "}{strings.quickSwitcher.hintNavigation}
            </span>
            <span>
              <kbd><CornerDownLeft size={12} aria-hidden="true" /></kbd>
              {" "}{strings.quickSwitcher.hintSelect}
            </span>
            <span>
              <kbd>{strings.sharedUi.escape}</kbd>
              {" "}{strings.quickSwitcher.hintClose}
            </span>
          </div>
          <div className="quick-switcher-footer-prefixes">
            <span>{strings.quickSwitcher.hintFilterPrefixes}</span>
          </div>
        </footer>
      </section>
    </div>
  );
}
