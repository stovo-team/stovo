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
import { Capacitor } from "@capacitor/core";

import { ApiError, ApiRequestOptions, apiRequest, getApiUrl, setApiUrlOverride, storeRefreshToken } from "../api/client";
import { prepareLocalReplicaProfile } from "../native/localReplicaPlugin";
import { unregisterDevicePushToken } from "../api/notifications";
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
import { clearAuthSession, isExpiredAuthError, isNetworkFailure, selectActiveServer, selectSavedServers } from "./authContextHelpers";
import { AuthState } from "./authContextTypes";

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
  const refreshRejectedRef = useRef(false);
  const serverGenerationRef = useRef(0);
  const refreshRef = useRef<() => Promise<AuthResponse>>(async () => { throw new ApiError(503, "Session refresh unavailable"); });
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = currentUser?.id ?? null;

  const activeServer = useMemo(() => {
    return selectActiveServer(serverState);
  }, [serverState]);

  const savedServers = useMemo(() => {
    return selectSavedServers(serverState);
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
      refreshRejectedRef.current = false;
      accessTokenRef.current = response.accessToken;
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
          refreshToken: Capacitor.isNativePlatform() ? response.refreshToken ?? active.refreshToken : null,
          user: response.user,
          healthStatus: "online"
        });
        setServerState(loadServerState());
      }
    },
    [scheduleProactiveRefresh]
  );

  useEffect(() => {
    doProactiveRefreshRef.current = async () => {
      try {
        await refreshRef.current();
      } catch (err) {
        if (!isExpiredAuthError(err) && !(err instanceof ApiError && err.status === 409)) {
          setIsOffline(true);
        }
        throw err;
      }
    };
  }, [applyAuthResponse]);

  const updateCurrentUser = useCallback((user: User) => {
    setCurrentUser(user);
  }, []);

  const clearExpiredSession = useCallback(async () => {
    accessTokenRef.current = null;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    await clearAuthSession(currentUserIdRef.current);
    storeRefreshToken(null);
    setAccessToken(null);
    setCurrentUser(null);
  }, []);

  const rejectExpiredRefresh = useCallback(async () => {
    if (refreshRejectedRef.current) return;
    refreshRejectedRef.current = true;
    await clearExpiredSession();
  }, [clearExpiredSession]);
  const refresh = useCallback(async () => {
    if (refreshRejectedRef.current) {
      throw new ApiError(401, "Session expired");
    }
    const requestGeneration = serverGenerationRef.current;
    const requestServerId = getActiveServer()?.id ?? null;
    const isCurrentServer = () => requestGeneration === serverGenerationRef.current && requestServerId === (getActiveServer()?.id ?? null);
    try {
      const response = await refreshSession();
      if (!isCurrentServer()) throw new ApiError(409, "Server changed during session refresh");
      applyAuthResponse(response);
      return response;
    } catch (err) {
      if (!isCurrentServer()) throw new ApiError(409, "Server changed during session refresh");
      if (isExpiredAuthError(err)) {
        await rejectExpiredRefresh();
      } else {
        setIsOffline(true);
      }
      throw err;
    }
  }, [applyAuthResponse, rejectExpiredRefresh]);
  refreshRef.current = refresh;

  const hotSwapServer = useCallback(
    async (serverId: string) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      const previousServerId = getActiveServer()?.id ?? null;
      const target = setActiveServerId(serverId);
      if (!target) return;
      if (target.id !== previousServerId) {
        serverGenerationRef.current += 1;
        refreshRejectedRef.current = false;
      }
      setServerState(loadServerState());
      setIsLoading(true);
      setIsOffline(false);
      setAccessToken(target.accessToken);
      setCurrentUser(target.user ?? null);

      try {
        await refresh();
      } catch (err) {
        // An invalid credential signs out; transient failures keep the cached session for reconnect.
        if (!isExpiredAuthError(err) && !(err instanceof ApiError && err.status === 409)) setIsOffline(true);
      } finally {
        setIsLoading(false);
      }
    },
    [applyAuthResponse, refresh]
  );

  const removeServer = useCallback((serverId: string) => {
    const previousActiveServerId = getActiveServer()?.id ?? null;
    const nextState = removeServerById(serverId);
    if (previousActiveServerId === serverId && nextState.activeServerId !== serverId) {
      serverGenerationRef.current += 1;
      refreshRejectedRef.current = false;
    }
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
      accessTokenRef.current = cachedAccount.accessToken;
      setAccessToken(cachedAccount.accessToken);
      setCurrentUser(cachedAccount.user);
      setIsOffline(typeof navigator !== "undefined" && !navigator.onLine);
    }

    refresh()
      .then(() => {
        // `refresh` applies the returned credentials and schedules the next rotation.
      })
      .catch((error) => {
        if (!cancelled) {
          // A temporary network failure must not erase the offline replica or
          // queued messages. Authentication failures still clear the session.
          if (isExpiredAuthError(error)) {
            void rejectExpiredRefresh();
          } else if (cachedAccount?.user && cachedAccount.accessToken &&
            (isNetworkFailure(error) || !isExpiredAuthError(error))) {
            setIsOffline(true);
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
  }, [refresh, rejectExpiredRefresh]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      serverGenerationRef.current += 1;
      const response = await loginRequest(payload);
      refreshRejectedRef.current = false;
      applyAuthResponse(response);
    },
    [applyAuthResponse]
  );

  const setup = useCallback(
    async (payload: SetupPayload) => {
      serverGenerationRef.current += 1;
      const response = await setupOwner(payload);
      refreshRejectedRef.current = false;
      applyAuthResponse(response);
    },
    [applyAuthResponse]
  );

  const acceptAuthResponse = useCallback(
    (response: AuthResponse) => {
      serverGenerationRef.current += 1;
      refreshRejectedRef.current = false;
      applyAuthResponse(response);
    },
    [applyAuthResponse]
  );

  const logout = useCallback(async () => {
    serverGenerationRef.current += 1;
    refreshRejectedRef.current = true;
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    if (accessTokenRef.current) {
      await unregisterDevicePushToken((endpoint, opts) =>
        apiRequest(endpoint, { ...opts, accessToken: accessTokenRef.current })
      ).catch(() => undefined);
    }
    await logoutRequest().catch(() => undefined);
    await clearAuthSession(currentUserIdRef.current);
    storeRefreshToken(null);
    setAccessToken(null);
    setCurrentUser(null);
  }, []);

  const authRequest = useCallback(
    async <T,>(endpoint: string, options: ApiRequestOptions = {}) => {
      try {
        if (refreshRejectedRef.current) throw new ApiError(401, "Session expired");
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
    [refresh]
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
