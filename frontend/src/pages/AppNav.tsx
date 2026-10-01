import { useEffect, useState, type MouseEvent } from "react";
import { NavLink } from "react-router-dom";
import { CalendarDays, Folder, LogOut, MessageCircle, Settings, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Family } from "../api/family";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useStrings } from "../i18n/LanguageContext";

export interface NavTabsVisibility {
  chats?: boolean;
  storage?: boolean;
  plans?: boolean;
  settings?: boolean;
}

export default function AppNav({
  unreadTotalOverride,
  navTabsOverride,
}: {
  unreadTotalOverride?: number;
  navTabsOverride?: NavTabsVisibility;
}) {
  const { authRequest, currentUser, logout } = useAuth();
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [navTabs, setNavTabs] = useState<NavTabsVisibility>(() => ({
    chats: true,
    storage: true,
    plans: true,
    settings: true,
    ...navTabsOverride,
  }));
  const canViewAdmin = currentUser?.role === "owner" || Boolean(currentUser?.permissions?.length);
  const prefersReducedMotion = useReducedMotion();
  const enableViewTransitions = !prefersReducedMotion;

  const match = typeof window !== "undefined" ? window.location.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)/) : null;
  const prefix = match ? `/s/${match[1]}` : "";

  useEffect(() => {
    if (navTabsOverride) {
      setNavTabs(navTabsOverride);
      return;
    }
    if (!currentUser) {
      return;
    }
    let cancelled = false;
    authRequest<Family>("/api/family")
      .then((fam) => {
        if (!cancelled && fam?.navTabs) {
          setNavTabs({
            chats: fam.navTabs.chats ?? true,
            storage: fam.navTabs.storage ?? true,
            plans: fam.navTabs.plans ?? true,
            settings: fam.navTabs.settings ?? true,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authRequest, currentUser, navTabsOverride]);

  useEffect(() => {
    if (typeof unreadTotalOverride === "number") {
      setUnreadTotal(unreadTotalOverride);
      return;
    }
    if (!currentUser) {
      setUnreadTotal(0);
      return;
    }
    let cancelled = false;
    authRequest<Array<{ unreadCount: number }>>("/api/chats")
      .then((chats) => {
        if (!cancelled) {
          setUnreadTotal(chats.reduce((total, chat) => total + chat.unreadCount, 0));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authRequest, currentUser, unreadTotalOverride]);

  const strings = useStrings();

  const showChats = navTabs.chats !== false;
  const showStorage = navTabs.storage !== false;
  const showPlans = navTabs.plans !== false;
  const showSettings = navTabs.settings !== false;
  // React Router still creates a navigation event when a link points to the
  // current location.  Replaying that event can restart route layout work on
  // fixed-height pages, so an already-selected tab is intentionally inert.
  const preventActiveTabNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.currentTarget.getAttribute("aria-current") === "page") {
      event.preventDefault();
    }
  };

  return (
    <nav className="app-nav app-nav--active-variant-a" aria-label={strings.nav.ariaLabel}>
      <div className="app-nav-links">
        {showChats && (
          <NavLink to={`${prefix}/app/chats`} title={strings.nav.chats} aria-label={strings.nav.chats} onClick={preventActiveTabNavigation}>
            <MessageCircle aria-hidden={true} />
            <span>{strings.nav.chats}</span>
            {unreadTotal > 0 && (
              <small className="nav-badge" aria-label={strings.nav.unreadMessages(unreadTotal)}>
                {unreadTotal > 99 ? "99+" : unreadTotal}
              </small>
            )}
          </NavLink>
        )}
        {showStorage && (
          <NavLink to={`${prefix}/app/files`} title={strings.nav.storage} aria-label={strings.nav.storage} onClick={preventActiveTabNavigation}>
            <Folder aria-hidden={true} />
            <span>{strings.nav.storage}</span>
          </NavLink>
        )}
        {showPlans && (
          <NavLink to={`${prefix}/app/plans`} title={strings.nav.plans} aria-label={strings.nav.plans} onClick={preventActiveTabNavigation}>
            <CalendarDays aria-hidden={true} />
            <span>{strings.nav.plans}</span>
          </NavLink>
        )}
        {showSettings && (
          <NavLink to={`${prefix}/app/settings`} title={strings.nav.settings} aria-label={strings.nav.settings} onClick={preventActiveTabNavigation}>
            <Settings aria-hidden={true} />
            <span>{strings.nav.settings}</span>
          </NavLink>
        )}
        {canViewAdmin && (
          <NavLink
            to={`${prefix}/app/admin`}
            title={strings.nav.admin}
            aria-label={strings.nav.admin}
            onClick={preventActiveTabNavigation}
            className={({ isActive }) =>
              isActive || (typeof window !== "undefined" && window.location.pathname.includes("/app/admin"))
                ? "active"
                : ""
            }
          >
            <ShieldCheck aria-hidden={true} />
            <span>{strings.nav.admin}</span>
          </NavLink>
        )}

      </div>
      <button className="app-nav-logout" type="button" aria-label={strings.nav.logOut} title={strings.nav.logOut} onClick={logout}>
        <LogOut aria-hidden={true} size={20} />
        <span>{strings.nav.logOut}</span>
      </button>
    </nav>
  );
}

