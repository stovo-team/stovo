import { ReactElement, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ensureFullScreenIntentPermission } from "./api/notifications";
import { AppearanceProvider } from "./appearance/AppearanceContext";
import { AuthProvider, useAuth } from "./auth/AuthContext";
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

function App() {
  useEffect(() => {
    void ensureFullScreenIntentPermission();
  }, []);

  return (
    <BrowserRouter>
      <AppearanceProvider>
        <AuthProvider>
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
