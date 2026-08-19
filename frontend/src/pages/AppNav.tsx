import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { CalendarDays, Folder, LogOut, MessageCircle, Settings, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useStrings } from "../i18n/LanguageContext";


export default function AppNav({ unreadTotalOverride }: { unreadTotalOverride?: number }) {
  const { authRequest, currentUser, logout } = useAuth();
  const [unreadTotal, setUnreadTotal] = useState(0);
  const canViewAdmin = currentUser?.role === "owner" || currentUser?.role === "admin";
  const prefersReducedMotion = useReducedMotion();
  const enableViewTransitions = !prefersReducedMotion;

  const match = typeof window !== "undefined" ? window.location.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)/) : null;
  const prefix = match ? `/s/${match[1]}` : "";

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

  return (
    <nav className="app-nav app-nav--active-variant-a" aria-label={strings.nav.ariaLabel}>
      <div className="app-nav-links">
        <NavLink to={`${prefix}/app/chats`} title={strings.nav.chats} aria-label={strings.nav.chats}>
          <MessageCircle aria-hidden={true} />
          <span>{strings.nav.chats}</span>
          {unreadTotal > 0 && (
            <small className="nav-badge" aria-label={strings.nav.unreadMessages(unreadTotal)}>
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </small>
          )}
        </NavLink>
        <NavLink to={`${prefix}/app/files`} title={strings.nav.storage} aria-label={strings.nav.storage}>
          <Folder aria-hidden={true} />
          <span>{strings.nav.storage}</span>
        </NavLink>
        <NavLink to={`${prefix}/app/plans`} title={strings.nav.plans} aria-label={strings.nav.plans}>
          <CalendarDays aria-hidden={true} />
          <span>{strings.nav.plans}</span>
        </NavLink>
        <NavLink to={`${prefix}/app/settings`} title={strings.nav.settings} aria-label={strings.nav.settings}>
          <Settings aria-hidden={true} />
          <span>{strings.nav.settings}</span>
        </NavLink>
        {canViewAdmin && (
          <NavLink
            to={`${prefix}/app/admin`}
            title={strings.nav.admin}
            aria-label={strings.nav.admin}
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

