import { ApiRequestOptions } from "../api/client";
import { AuthResponse, LoginPayload, SetupPayload, User } from "../api/auth";
import { ServerAccount } from "../api/serverRegistry";

export interface AuthState {
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
