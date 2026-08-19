import { ReactElement, useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

import {
  bootstrapNotifications,
  consumePendingNotificationAction,
  ensureFullScreenIntentPermission
} from "./api/notifications";
import { AppearanceProvider } from "./appearance/AppearanceContext";
import { LanguageProvider } from "./i18n/LanguageContext";
import WallpaperCustomImageBridge from "./appearance/WallpaperCustomImageBridge";

import AppLockGate from "./AppLockGate";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { navigateWithMotion } from "./motion/navigation";
import {
  getAudioPlaybackAppLinkPath,
  getInviteAppLinkPath,
  getNotificationAppLink
} from "./appLinks";
import { parseConnectionLink } from "./connectionLink";
import { queuePendingNotificationAction } from "./notificationActions";
import { addNativeShareListener, consumeNativeSharedFiles } from "./native/shareReceiverPlugin";
import { queueSharedFiles } from "./sharedFileQueue";
import AdminPage from "./pages/AdminPage";
import AdminAppearancePage from "./pages/AdminAppearancePage";
import AdminEncryptionPage from "./pages/AdminEncryptionPage";
import AdminMcpPage from "./pages/AdminMcpPage";
import AdminMembersPage from "./pages/AdminMembersPage";
import ChatsPage from "./pages/ChatsPage";
import FilesPage from "./pages/FilesPage";
import InvitePage from "./pages/InvitePage";
import LoginPage from "./pages/LoginPage";
import PlansPage from "./pages/PlansPage";
import RootRedirect from "./pages/RootRedirect";
import ServerSetupPage from "./pages/ServerSetupPage";
import SettingsPage from "./pages/SettingsPage";
import SetupPage from "./pages/SetupPage";
import MultiAdminPage from "./pages/MultiAdminPage";

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
      const connection = parseConnectionLink(url);
      if (connection) {
        const params = new URLSearchParams({ server: connection.serverUrl, username: connection.username });
        params.set("deviceLogin", "1");
        navigate(`/server-setup?${params}`);
        return;
      }
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

function NativeShareRouter() {
  const navigate = useNavigate();
  const { currentUser, isLoading } = useAuth();
  const [shareRevision, setShareRevision] = useState(0);

  useEffect(() => {
    let disposed = false;
    let remove: () => void = () => undefined;
    void addNativeShareListener(() => setShareRevision((current) => current + 1)).then((cleanup) => {
      remove = cleanup;
      if (disposed) remove();
    });
    return () => {
      disposed = true;
      remove();
    };
  }, []);

  useEffect(() => {
    if (isLoading || !currentUser) {
      return;
    }
    let cancelled = false;
    void consumeNativeSharedFiles().then((received) => {
      if (cancelled || (received.files.length === 0 && received.skippedCount === 0)) {
        return;
      }
      queueSharedFiles(received);
      navigate("/app/chats");
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser, isLoading, navigate, shareRevision]);

  return null;
}

function ClusterRoutes() {
  const { slug } = useParams();
  const prefix = slug ? `/s/${slug}` : "";
  const location = useLocation();
  const previousPathRef = useRef(location.pathname);
  // A transformed ancestor becomes the containing block for `position: fixed`
  // in Android WebView.  The tab-transition class must therefore exist only
  // while its animation is actually playing; leaving it on the route layer
  // makes the bottom navigation scroll away with the page.
  const [motionFinishedForPath, setMotionFinishedForPath] = useState<string | null>(null);

  // These are deliberately ordered by their position in the bottom bar.  Do
  // not use a circular distance here: Chats -> Settings is a forward movement
  // and Settings -> Chats is a backward movement.
  const tabIndex = (pathname: string) => {
    if (pathname.startsWith(`${prefix}/app/chats`) || pathname.startsWith("/app/chats")) return 0;
    if (pathname.startsWith(`${prefix}/app/files`) || pathname.startsWith("/app/files")) return 1;
    if (pathname.startsWith(`${prefix}/app/plans`) || pathname.startsWith("/app/plans")) return 2;
    if (pathname.startsWith(`${prefix}/app/settings`) || pathname.startsWith("/app/settings")) return 3;
    if (pathname.startsWith(`${prefix}/app/admin`) || pathname.startsWith("/app/admin")) return 4;
    return null;
  };
  const previousIndex = tabIndex(previousPathRef.current);
  const currentIndex = tabIndex(location.pathname);
  const routeDirection =
    previousIndex !== null && currentIndex !== null && previousIndex !== currentIndex
      ? currentIndex > previousIndex
        ? "forward"
        : "back"
      : "none";

  useEffect(() => {
    previousPathRef.current = location.pathname;
  }, [location.pathname]);

  const routeMotionClass =
    routeDirection !== "none" && motionFinishedForPath !== location.pathname
      ? ` app-route-layer--${routeDirection}`
      : "";

  return (
    <div
      key={location.pathname}
      className={`app-route-layer${routeMotionClass}`}
      aria-live="off"
      onAnimationEnd={() => {
        setMotionFinishedForPath(location.pathname);
      }}
    >
    <Routes location={location}>
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
            <Navigate to={`${prefix}/app/settings?family=1`} replace />
          </RequireAuth>
        }
      />
      <Route
        path="/app/plans"
        element={
          <RequireAuth>
            <PlansPage />
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
        path="/app/admin/appearance"
        element={
          <RequireAuth>
            <AdminAppearancePage />
          </RequireAuth>
        }
      />
      <Route
        path="/app/admin/encryption"
        element={
          <RequireAuth>
            <AdminEncryptionPage />
          </RequireAuth>
        }
      />
      <Route
        path="/app/admin/mcp"
        element={
          <RequireAuth>
            <AdminMcpPage />
          </RequireAuth>
        }
      />
      <Route
        path="/app/admin/members"
        element={
          <RequireAuth>
            <AdminMembersPage />
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
      <Route path="*" element={<Navigate to={`${prefix}/app/chats`} replace />} />
    </Routes>
    </div>
  );
}

function App() {
  useEffect(() => {
    void ensureFullScreenIntentPermission();
  }, []);

  return (
    <BrowserRouter>
      <LanguageProvider>
        <AppearanceProvider>
          <AuthProvider>
            <WallpaperCustomImageBridge />
            <NotificationsBootstrapper />
            <AndroidBackOrchestrator />
            <NativeAppLinkRouter />
            <NativeShareRouter />
            <AppLockGate />
            <Routes>
              <Route path="/multi-admin" element={<MultiAdminPage />} />
              <Route path="/s/:slug/*" element={<ClusterRoutes />} />
              <Route path="/*" element={<ClusterRoutes />} />
            </Routes>
          </AuthProvider>
        </AppearanceProvider>
      </LanguageProvider>
    </BrowserRouter>
  );

}

export default App;
