import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { CalendarDays, Folder, LogOut, MessageCircle, Settings, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useReducedMotion } from "../hooks/useReducedMotion";

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

  return (
    <nav className="app-nav app-nav--active-variant-a" aria-label="Application navigation">
      <div className="app-nav-links">
        <NavLink to={`${prefix}/app/chats`} title="Chats" aria-label="Chats">
          <MessageCircle aria-hidden={true} />
          <span>Chats</span>
          {unreadTotal > 0 && (
            <small className="nav-badge" aria-label={`${unreadTotal} unread messages`}>
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </small>
          )}
        </NavLink>
        <NavLink to={`${prefix}/app/files`} title="Storage" aria-label="Storage">
          <Folder aria-hidden={true} />
          <span>Storage</span>
        </NavLink>
        <NavLink to={`${prefix}/app/plans`} title="Plans" aria-label="Plans">
          <CalendarDays aria-hidden={true} />
          <span>Plans</span>
        </NavLink>
        <NavLink to={`${prefix}/app/settings`} title="Settings" aria-label="Settings">
          <Settings aria-hidden={true} />
          <span>Settings</span>
        </NavLink>
        {canViewAdmin && (
          <NavLink to={`${prefix}/app/admin`} title="Admin" aria-label="Admin">
            <ShieldCheck aria-hidden={true} />
            <span>Admin</span>
          </NavLink>
        )}
      </div>
      <button className="app-nav-logout" type="button" aria-label="Log out" title="Log out" onClick={logout}>
        <LogOut aria-hidden={true} size={20} />
        <span>Log out</span>
      </button>
    </nav>
  );
}
