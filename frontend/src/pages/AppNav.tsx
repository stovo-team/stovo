import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { CalendarDays, Folder, MessageCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import VeloLogo from "../components/VeloLogo";
import { useReducedMotion } from "../hooks/useReducedMotion";

export default function AppNav({ unreadTotalOverride }: { unreadTotalOverride?: number }) {
  const { authRequest, currentUser, logout } = useAuth();
  const [unreadTotal, setUnreadTotal] = useState(0);
  const canViewAdmin = currentUser?.role === "owner" || currentUser?.role === "admin";
  const prefersReducedMotion = useReducedMotion();
  const enableViewTransitions = !prefersReducedMotion;

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
      <div className="app-brand" aria-label="Stovo">
        <span className="app-brand-mark">
          <VeloLogo className="app-brand-logo" title="Stovo" />
        </span>
        <span>
          <strong>Stovo</strong>
          <small>Private space</small>
        </span>
      </div>
      <div className="app-nav-links">
        <NavLink to="/app/chats" title="Chats" aria-label="Chats" viewTransition={enableViewTransitions}>
          <MessageCircle aria-hidden={true} />
          <span>Chats</span>
          {unreadTotal > 0 && (
            <small className="nav-badge" aria-label={`${unreadTotal} unread messages`}>
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </small>
          )}
        </NavLink>
        <NavLink to="/app/files" title="Storage" aria-label="Storage" viewTransition={enableViewTransitions}>
          <Folder aria-hidden={true} />
          <span>Storage</span>
        </NavLink>
        <NavLink to="/app/plans" title="Plans" aria-label="Plans" viewTransition={enableViewTransitions}>
          <CalendarDays aria-hidden={true} />
          <span>Plans</span>
        </NavLink>
        <NavLink to="/app/settings" title="Settings" aria-label="Settings" viewTransition={enableViewTransitions}>
          {({ isActive }) => (
            <>
              <span
                className={`ms-icon ms-icon--22${isActive ? " ms-icon--filled" : ""}`}
                aria-hidden={true}
              >
                settings
              </span>
              <span>Settings</span>
            </>
          )}
        </NavLink>
        {canViewAdmin && (
          <NavLink to="/app/admin" title="Admin" aria-label="Admin" viewTransition={enableViewTransitions}>
            {({ isActive }) => (
              <>
                <span
                  className={`ms-icon ms-icon--22${isActive ? " ms-icon--filled" : ""}`}
                  aria-hidden={true}
                >
                  verified_user
                </span>
                <span>Admin</span>
              </>
            )}
          </NavLink>
        )}
      </div>
      <button className="app-nav-logout" type="button" aria-label="Log out" title="Log out" onClick={logout}>
        <span className="ms-icon ms-icon--20" aria-hidden={true}>
          logout
        </span>
        <span>Log out</span>
      </button>
    </nav>
  );
}
