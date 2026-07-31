import { ReactElement, useEffect, useRef } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

import {
  bootstrapNotifications,
  consumePendingNotificationAction,
  ensureFullScreenIntentPermission
} from "./api/notifications";
import { AppearanceProvider } from "./appearance/AppearanceContext";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { navigateWithMotion } from "./motion/navigation";
import {
  getAudioPlaybackAppLinkPath,
  getInviteAppLinkPath,
  getNotificationAppLink
} from "./appLinks";
import { queuePendingNotificationAction } from "./notificationActions";
import AdminPage from "./pages/AdminPage";
import ChatsPage from "./pages/ChatsPage";
import FilesPage from "./pages/FilesPage";
import InvitePage from "./pages/InvitePage";
import LoginPage from "./pages/LoginPage";
import MembersPage from "./pages/MembersPage";
import RootRedirect from "./pages/RootRedirect";
import ServerSetupPage from "./pages/ServerSetupPage";
import SettingsPage from "./pages/SettingsPage";
import SetupPage from "./pages/SetupPage";

if (typeof document !== "undefined") {
  document.documentElement.dataset.platform = Capacitor.isNativePlatform() ? "native" : "web";
}

/**
 * Starts NtfyService whenever a session is available — covers both login and
 * session restore on app reopen. Deduplicates via ref so it only fires once
 * per user ID (not on every token refresh).
 */
function NotificationsBootstrapper() {
  const { currentUser, authRequest } = useAuth();
  const lastBootstrappedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      lastBootstrappedUserId.current = null;
      return;
    }
    if (lastBootstrappedUserId.current === currentUser.id) return;
    lastBootstrappedUserId.current = currentUser.id;
    void bootstrapNotifications(authRequest).catch(() => undefined);
  }, [currentUser, authRequest]);

  return null;
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) {
    return <main className="app-shell">Loading session...</main>;
  }
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AndroidBackOrchestrator() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    let disposed = false;
    let listener: { remove: () => Promise<void> } | null = null;

    void (async () => {
      listener = await CapacitorApp.addListener("backButton", ({ canGoBack }) => {
        if (location.pathname.startsWith("/app/chats")) {
          return;
        }

        if (location.pathname.startsWith("/app/")) {
          if (canGoBack) {
            navigate(-1);
            return;
          }

          navigateWithMotion(navigate, "/app/chats", {
            replace: true,
            reducedMotion: prefersReducedMotion
          });
          return;
        }

        if (canGoBack) {
          navigate(-1);
          return;
        }

        void CapacitorApp.minimizeApp();
      });

      if (disposed) {
        void listener.remove();
      }
    })();

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [location.pathname, navigate, prefersReducedMotion]);

  return null;
}

function NativeAppLinkRouter() {
  const navigate = useNavigate();
  const { currentUser, isLoading } = useAuth();
  const lastCallbackLinkChatIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    let disposed = false;
    let listener: { remove: () => Promise<void> } | null = null;

    const openAppLink = (url: string) => {
      const notificationLink = getNotificationAppLink(url);
      if (notificationLink?.action === "callback") {
        const chatId = notificationLink.path.split("/").pop();
        if (chatId) {
          lastCallbackLinkChatIdRef.current = chatId;
          queuePendingNotificationAction({ type: "callback", chatId });
        }
      }
      const path = notificationLink
        ? `${notificationLink.path}${
            notificationLink.action
              ? `?notificationAction=${notificationLink.action}&notificationActionId=${Date.now()}`
              : ""
          }`
        : getAudioPlaybackAppLinkPath(url) ?? getInviteAppLinkPath(url);
      if (path) {
        navigate(path);
      }
    };

    void (async () => {
      listener = await CapacitorApp.addListener("appUrlOpen", ({ url }) => openAppLink(url));
      const launchUrl = await CapacitorApp.getLaunchUrl();
      if (launchUrl?.url) {
        openAppLink(launchUrl.url);
      }
      if (disposed) {
        void listener.remove();
      }
    })();

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [navigate]);

  useEffect(() => {
    if (isLoading || !currentUser || !Capacitor.isNativePlatform()) {
      return;
    }
    let cancelled = false;
    void consumePendingNotificationAction().then((action) => {
      if (!action || cancelled) {
        return;
      }
      if (
        action.type === "callback" &&
        lastCallbackLinkChatIdRef.current === action.chatId
      ) {
        lastCallbackLinkChatIdRef.current = null;
        return;
      }
      queuePendingNotificationAction(action);
      navigate(
        `/app/chats/${encodeURIComponent(action.chatId)}?notificationAction=${action.type}` +
          `&notificationActionId=${Date.now()}`
      );
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser, isLoading, navigate]);

  return null;
}

function App() {
  useEffect(() => {
    void ensureFullScreenIntentPermission();
  }, []);

  return (
    <BrowserRouter>
      <AppearanceProvider>
        <AuthProvider>
          <NotificationsBootstrapper />
          <AndroidBackOrchestrator />
          <NativeAppLinkRouter />
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/server-setup" element={<ServerSetupPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route
              path="/app/chats"
              element={
                <RequireAuth>
                  <ChatsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/app/chats/:chatId"
              element={
                <RequireAuth>
                  <ChatsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/app/members"
              element={
                <RequireAuth>
                  <MembersPage />
                </RequireAuth>
              }
            />
            <Route
              path="/app/files"
              element={
                <RequireAuth>
                  <FilesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/app/admin"
              element={
                <RequireAuth>
                  <AdminPage />
                </RequireAuth>
              }
            />
            <Route
              path="/app/settings"
              element={
                <RequireAuth>
                  <SettingsPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </AppearanceProvider>
    </BrowserRouter>
  );
}

export default App;
