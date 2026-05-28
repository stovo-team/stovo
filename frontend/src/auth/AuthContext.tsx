import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import { ApiError, ApiRequestOptions, apiRequest } from "../api/client";
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

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const acceptAuthResponse = useCallback((response: AuthResponse) => {
    setAccessToken(response.accessToken);
    setCurrentUser(response.user);
  }, []);

  const updateCurrentUser = useCallback((user: User) => {
    setCurrentUser(user);
  }, []);

  const refresh = useCallback(async () => {
    const response = await refreshSession();
    acceptAuthResponse(response);
    return response;
  }, [acceptAuthResponse]);

  useEffect(() => {
    let cancelled = false;

    refresh()
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
    };
  }, [refresh]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      acceptAuthResponse(await loginRequest(payload));
    },
    [acceptAuthResponse]
  );

  const setup = useCallback(
    async (payload: SetupPayload) => {
      acceptAuthResponse(await setupOwner(payload));
    },
    [acceptAuthResponse]
  );

  const logout = useCallback(async () => {
    await logoutRequest().catch(() => undefined);
    setAccessToken(null);
    setCurrentUser(null);
  }, []);

  const authRequest = useCallback(
    async <T,>(endpoint: string, options: ApiRequestOptions = {}) => {
      try {
        return await apiRequest<T>(endpoint, {
          ...options,
          accessToken
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
    [accessToken, refresh]
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
