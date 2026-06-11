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

import { ApiError, ApiRequestOptions, apiRequest, storeRefreshToken } from "../api/client";
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

interface AuthState {
  accessToken: string | null;
  currentUser: User | null;
  isLoading: boolean;
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
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

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
      scheduleProactiveRefresh(response.expiresInSeconds);
      if (response.refreshToken) {
        storeRefreshToken(response.refreshToken);
      }
    },
    [scheduleProactiveRefresh]
  );

  // Keep the ref up to date with the latest applyAuthResponse
  useEffect(() => {
    doProactiveRefreshRef.current = async () => {
      const response = await refreshSession();
      applyAuthResponse(response);
    };
  }, [applyAuthResponse]);

  const updateCurrentUser = useCallback((user: User) => {
    setCurrentUser(user);
  }, []);

  // Used by authRequest 401 retry — also reschedules proactive refresh
  const refresh = useCallback(async () => {
    const response = await refreshSession();
    applyAuthResponse(response);
    return response;
  }, [applyAuthResponse]);

  // On mount: attempt to restore session from the refresh cookie
  useEffect(() => {
    let cancelled = false;

    refreshSession()
      .then((response) => {
        if (!cancelled) {
          applyAuthResponse(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccessToken(null);
          setCurrentUser(null);
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
  }, []);

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
    storeRefreshToken(null);
    setAccessToken(null);
    setCurrentUser(null);
  }, []);

  const authRequest = useCallback(
    async <T,>(endpoint: string, options: ApiRequestOptions = {}) => {
      try {
        return await apiRequest<T>(endpoint, {
          ...options,
          accessToken: accessTokenRef.current
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          const refreshed = await refresh();
          return apiRequest<T>(endpoint, {
            ...options,
            accessToken: refreshed.accessToken
          });
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
