import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { ApiError, ApiRequestOptions, apiRequest, getApiUrl, setApiUrlOverride, storeRefreshToken } from "../api/client";
import { clearRecentChatHistory } from "../chatHistoryCache";
import { clearCachedFileLists } from "../fileLibraryCache";
import { clearPersistentMediaBlobCache } from "../mediaBlobCache";
import { clearOutbox } from "../features/chats/outbox/messageOutboxStore";
import { clearLocalReplicaProfile, prepareLocalReplicaProfile } from "../native/localReplicaPlugin";
import {
  AuthResponse,
  LoginPayload,
  SetupPayload,
  User,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
  setupOwner
} from "../api/auth";

import {
  ServerAccount,
  getActiveServer,
  loadServerState,
  removeServerById,
  setActiveServerId,
  upsertServer
} from "../api/serverRegistry";

function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (error instanceof TypeError) return true;
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    return status === 0 || status === 408 || status === 502 || status === 503 || status === 504;
  }
  return false;
}

interface AuthState {
  accessToken: string | null;
  currentUser: User | null;
  isLoading: boolean;
  activeServer: ServerAccount | null;
  savedServers: ServerAccount[];
  isOffline: boolean;
  hotSwapServer: (serverId: string) => Promise<void>;
  removeServer: (serverId: string) => void;
  login: (payload: LoginPayload) => Promise<void>;
  setup: (payload: SetupPayload) => Promise<void>;
  acceptAuthResponse: (response: AuthResponse) => void;
  updateCurrentUser: (user: User) => void;
  logout: () => Promise<void>;
  authRequest: <T>(endpoint: string, options?: ApiRequestOptions) => Promise<T>;
}

// Refresh this many seconds before the token actually expires
const REFRESH_BUFFER_SECONDS = 60;

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [serverState, setServerState] = useState(() => loadServerState());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  const activeServer = useMemo(() => {
    if (!serverState.activeServerId) return null;
    return serverState.servers[serverState.activeServerId] ?? null;
  }, [serverState]);

  const savedServers = useMemo(() => {
    return Object.values(serverState.servers).filter((s) => {
      if (!s.url) return false;
      const hasCreds = Boolean(s.accessToken || s.refreshToken || s.user);
      const isActive = s.id === serverState.activeServerId;
      return isActive || hasCreds;
    });
  }, [serverState]);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  // Generate/open the account key before the first route reads its replica.
  // This is deliberately best-effort: web and unsupported Android devices
  // retain their existing startup behavior, while the native bridge reports
  // any key failure through its fail-closed cache writes.
  useEffect(() => {
    if (currentUser?.id) void prepareLocalReplicaProfile(currentUser.id);
  }, [currentUser?.id]);

  // The registry is also updated by route discovery and background family
  // loading. Keep this React view in sync with those storage updates.
  useEffect(() => {
    const syncServerState = () => setServerState(loadServerState());
    window.addEventListener("stovo:servers-changed", syncServerState);
    return () => window.removeEventListener("stovo:servers-changed", syncServerState);
  }, []);

  // Use a ref so the scheduled callback always calls the latest version
  // without causing re-renders or stale closure issues.
  const doProactiveRefreshRef = useRef<() => Promise<void>>(async () => undefined);

  const scheduleProactiveRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    const delayMs = Math.max(0, (expiresInSeconds - REFRESH_BUFFER_SECONDS) * 1000);
    refreshTimerRef.current = setTimeout(() => {
      doProactiveRefreshRef.current().catch(() => undefined);
    }, delayMs);
  }, []);

  const applyAuthResponse = useCallback(
    (response: AuthResponse) => {
      setAccessToken(response.accessToken);
      setCurrentUser(response.user);
      setIsOffline(false);
      scheduleProactiveRefresh(response.expiresInSeconds);
      if (response.refreshToken) {
        storeRefreshToken(response.refreshToken);
      }
      const currentUrl = getApiUrl();
      if (currentUrl) {
        setApiUrlOverride(currentUrl);
      }
      const active = getActiveServer();
      if (active) {
        upsertServer({
          ...active,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken ?? active.refreshToken,
          user: response.user,
          healthStatus: "online"
        });
        setServerState(loadServerState());
      }
    },
    [scheduleProactiveRefresh]
  );

  // Keep the ref up to date with the latest applyAuthResponse
  useEffect(() => {
    doProactiveRefreshRef.current = async () => {
      try {
        const response = await refreshSession();
        applyAuthResponse(response);
      } catch (err) {
        setIsOffline(true);
        throw err;
      }
    };
  }, [applyAuthResponse]);

  const updateCurrentUser = useCallback((user: User) => {
    setCurrentUser(user);
  }, []);

  const clearOfflineSessionState = useCallback(async () => {
    const profileId = currentUser?.id;
    await Promise.allSettled([
      clearRecentChatHistory(),
      clearCachedFileLists(),
      clearPersistentMediaBlobCache(),
      clearOutbox(),
      ...(profileId ? [clearLocalReplicaProfile(profileId)] : []),
    ]);
  }, [currentUser?.id]);

  const clearExpiredSession = useCallback(async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    await clearOfflineSessionState();
    storeRefreshToken(null);
    setAccessToken(null);
    setCurrentUser(null);
  }, [clearOfflineSessionState]);

  const refresh = useCallback(async () => {
    try {
      const response = await refreshSession();
      applyAuthResponse(response);
      return response;
    } catch (err) {
      setIsOffline(true);
      throw err;
    }
  }, [applyAuthResponse]);

  const hotSwapServer = useCallback(
    async (serverId: string) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      const target = setActiveServerId(serverId);
      if (!target) return;
      setServerState(loadServerState());
      setIsLoading(true);
      setIsOffline(false);
      setAccessToken(target.accessToken);
      setCurrentUser(target.user ?? null);

      try {
        const response = await refreshSession();
        applyAuthResponse(response);
      } catch (err) {
        // Target server is offline or refresh token expired — stay on target context with reconnecting state
        setIsOffline(true);
      } finally {
        setIsLoading(false);
      }
    },
    [applyAuthResponse]
  );

  const removeServer = useCallback((serverId: string) => {
    const nextState = removeServerById(serverId);
    setServerState(nextState);
    if (nextState.activeServerId) {
      const nextActive = nextState.servers[nextState.activeServerId];
      setAccessToken(nextActive?.accessToken ?? null);
      setCurrentUser(nextActive?.user ?? null);
    } else {
      setAccessToken(null);
      setCurrentUser(null);
    }
  }, []);

  // On mount: attempt to restore session from the refresh token
  useEffect(() => {
    let cancelled = false;
    const cachedAccount = getActiveServer();

    // A remembered account is enough to open its local replica while the
    // server is unavailable. Normal refresh resumes when connectivity returns.
    if (cachedAccount?.user && cachedAccount.accessToken) {
      setAccessToken(cachedAccount.accessToken);
      setCurrentUser(cachedAccount.user);
      setIsOffline(typeof navigator !== "undefined" && !navigator.onLine);
    }

    refreshSession()
      .then((response) => {
        if (!cancelled) {
          applyAuthResponse(response);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          // A temporary network failure must not erase the offline replica or
          // queued messages. Authentication failures still clear the session.
          if (cachedAccount?.user && cachedAccount.accessToken &&
            (isNetworkFailure(error) || !(error instanceof ApiError) || (error.status !== 401 && error.status !== 403))) {
            setIsOffline(true);
          } else {
            void clearExpiredSession();
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [applyAuthResponse, clearExpiredSession]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      applyAuthResponse(await loginRequest(payload));
    },
    [applyAuthResponse]
  );

  const setup = useCallback(
    async (payload: SetupPayload) => {
      applyAuthResponse(await setupOwner(payload));
    },
    [applyAuthResponse]
  );

  const acceptAuthResponse = useCallback(
    (response: AuthResponse) => {
      applyAuthResponse(response);
    },
    [applyAuthResponse]
  );

  const logout = useCallback(async () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    await logoutRequest().catch(() => undefined);
    await clearOfflineSessionState();
    storeRefreshToken(null);
    setAccessToken(null);
    setCurrentUser(null);
  }, [clearOfflineSessionState]);

  const authRequest = useCallback(
    async <T,>(endpoint: string, options: ApiRequestOptions = {}) => {
      try {
        const res = await apiRequest<T>(endpoint, {
          ...options,
          accessToken: accessTokenRef.current
        });
        setIsOffline(false);
        return res;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          try {
            const refreshed = await refresh();
            return await apiRequest<T>(endpoint, {
              ...options,
              accessToken: refreshed.accessToken
            });
          } catch (refreshError) {
            await clearExpiredSession();
            throw refreshError;
          }
        }
        if (error instanceof TypeError) {
          // Network connection error
          setIsOffline(true);
        }
        throw error;
      }
    },
    [clearExpiredSession, refresh]
  );

  const value = useMemo(
    () => ({
      accessToken,
      currentUser,
      isLoading,
      activeServer,
      savedServers,
      isOffline,
      hotSwapServer,
      removeServer,
      login,
      setup,
      acceptAuthResponse,
      updateCurrentUser,
      logout,
      authRequest
    }),
    [
      accessToken,
      currentUser,
      isLoading,
      activeServer,
      savedServers,
      isOffline,
      hotSwapServer,
      removeServer,
      login,
      setup,
      acceptAuthResponse,
      updateCurrentUser,
      logout,
      authRequest
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
