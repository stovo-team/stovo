import { useEffect, useRef, useState } from "react";
import { BrowserRouter, matchPath, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

import { ensureFullScreenIntentPermission } from "./api/notifications";
import { AppearanceProvider } from "./appearance/AppearanceContext";
import { LanguageProvider } from "./i18n/LanguageContext";
import WallpaperCustomImageBridge from "./appearance/WallpaperCustomImageBridge";

import AppLockGate from "./AppLockGate";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { NativeAppOrchestrators } from "./native/NativeAppOrchestrators";
import AdminPage from "./pages/AdminPage";
import AdminAppearancePage from "./pages/AdminAppearancePage";
import AdminEncryptionPage from "./pages/AdminEncryptionPage";
import AdminMcpPage from "./pages/AdminMcpPage";
import AdminMembersPage from "./pages/AdminMembersPage";
import AdminRolesPage from "./pages/AdminRolesPage";
import AdminDefaultsPage from "./pages/AdminDefaultsPage";
import AdminServerSettingsPage from "./pages/AdminServerSettingsPage";
import AdminStatsPage from "./pages/AdminStatsPage";
import AdminPluginsPage from "./pages/AdminPluginsPage";
import ChatsPage from "./pages/ChatsPage";
import FilesPage from "./pages/FilesPage";
import InvitePage from "./pages/InvitePage";
import GuestMeetingPage from "./pages/GuestMeetingPage";
import LoginPage from "./pages/LoginPage";
import QRLoginApprovalPage from "./pages/QRLoginApprovalPage";
import PlansPage from "./pages/PlansPage";
import RootRedirect from "./pages/RootRedirect";
import ServerSetupPage from "./pages/ServerSetupPage";
import SettingsPage from "./pages/SettingsPage";
import SetupPage from "./pages/SetupPage";
import MultiAdminPage from "./pages/MultiAdminPage";
import CanvasPage from "./pages/CanvasPage";
import ChecklistPage from "./pages/ChecklistPage";
import LegalDocumentsPage from "./pages/LegalDocumentsPage";
import { IntelligenceConsentPage } from "./pages/IntelligenceConsentPage";
import { useStrings } from "./i18n/LanguageContext";
import { KeyboardShortcutsProvider, useKeyboardShortcuts } from "./shortcuts/KeyboardShortcutsContext";
import { QuickSwitcherModal } from "./components/QuickSwitcherModal";

if (typeof document !== "undefined") {
  document.documentElement.dataset.platform = Capacitor.isNativePlatform() ? "native" : "web";
}

function ClusterRoutes() {
  const strings = useStrings();
  const { slug } = useParams();
  const prefix = slug ? `/s/${slug}` : "";
  const location = useLocation();
  const chatRouteMatch = matchPath({ path: `${prefix}/app/chats/:chatId?`, end: true }, location.pathname);
  const chatRouteActive = Boolean(chatRouteMatch);
  const [hasVisitedChats, setHasVisitedChats] = useState(chatRouteActive);
  const cachedChatIdRef = useRef(chatRouteMatch?.params.chatId);
  if (chatRouteActive) cachedChatIdRef.current = chatRouteMatch?.params.chatId;
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
  useEffect(() => {
    if (chatRouteActive) {
      setHasVisitedChats(true);
    } else if (currentIndex === null) {
      setHasVisitedChats(false);
    }
  }, [chatRouteActive, currentIndex]);

  const showChatsRoute = chatRouteActive || (hasVisitedChats && currentIndex !== null);
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
      className={`app-route-layer${routeMotionClass}`}
      aria-live="off"
      onAnimationEnd={(event) => {
        // Page content can have its own animations (for example settings
        // cards). Their bubbling events must not end the route carousel early.
        if (event.target !== event.currentTarget) return;
        setMotionFinishedForPath(location.pathname);
      }}
    >
    {showChatsRoute && (
      <div
        className="app-cached-chat-route"
        style={{ display: chatRouteActive ? "contents" : "none" }}
        aria-hidden={!chatRouteActive}
      >
        <RequireAuth>
          <ChatsPage routeChatId={chatRouteActive ? chatRouteMatch?.params.chatId : cachedChatIdRef.current} />
        </RequireAuth>
      </div>
    )}
    <div key={location.pathname}>
    <Routes location={location}>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/server-setup" element={<ServerSetupPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/intelligence/consent" element={<RequireAuth><IntelligenceConsentPage strings={strings} /></RequireAuth>} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/app/qr-login/:requestId" element={<RequireAuth><QRLoginApprovalPage /></RequireAuth>} />
      <Route path="/meet/:token" element={<GuestMeetingPage />} />
      <Route path="/legal/:document?" element={<LegalDocumentsPage />} />
      <Route path="/privacy" element={<Navigate to="/legal/privacy" replace />} />
      <Route path="/terms" element={<Navigate to="/legal/terms" replace />} />
      <Route path="/release-notes" element={<Navigate to="/legal/release-notes" replace />} />
      <Route path="/app/chats/:chatId?" element={null} />
      <Route path="/app/canvas/:canvasId" element={<RequireAuth><CanvasPage /></RequireAuth>} />
      <Route path="/app/checklist/:checklistId" element={<RequireAuth><ChecklistPage /></RequireAuth>} />
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
      <Route path="/app/admin/roles" element={<RequireAuth><AdminRolesPage /></RequireAuth>} />
      <Route path="/app/admin/defaults" element={<RequireAuth><AdminDefaultsPage /></RequireAuth>} />
      <Route path="/app/admin/server-settings" element={<RequireAuth><AdminServerSettingsPage /></RequireAuth>} />
      <Route path="/app/admin/plugins" element={<RequireAuth><AdminPluginsPage /></RequireAuth>} />
      <Route path="/app/admin/stats" element={<Navigate to={`${prefix}/app/settings/statistics`} replace />} />
      <Route
        path="/app/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />
      <Route path="/app/settings/statistics" element={<RequireAuth><AdminStatsPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to={`${prefix}/app/chats`} replace />} />
    </Routes>
    </div>
    </div>
  );
}

function GlobalQuickSwitcher() {
  const { isQuickSwitcherOpen, closeQuickSwitcher } = useKeyboardShortcuts();
  return <QuickSwitcherModal open={isQuickSwitcherOpen} onClose={closeQuickSwitcher} />;
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
            <KeyboardShortcutsProvider>
              <WallpaperCustomImageBridge />
              <NativeAppOrchestrators />
              <AppLockGate />
              <GlobalQuickSwitcher />
              <Routes>
                <Route path="/multi-admin" element={<MultiAdminPage />} />
                <Route path="/s/:slug/*" element={<ClusterRoutes />} />
                <Route path="/*" element={<ClusterRoutes />} />
              </Routes>
            </KeyboardShortcutsProvider>
          </AuthProvider>
        </AppearanceProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
