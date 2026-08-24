import { createContext, useContext, type ReactNode } from "react";
import type { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import type { CallSessionApi } from "./useCallSession";

type CallFeatureContextValue = {
  session: CallSessionApi;
  isMobileViewport: boolean;
  members: User[];
  currentUser: User | null;
  chats: Chat[];
  onOpenChat?: (chat: Chat) => void;
};

const CallFeatureContext = createContext<CallFeatureContextValue | null>(null);

type CallFeatureProviderProps = CallFeatureContextValue & { children: ReactNode };

/** Shares call UI dependencies without duplicating them across call surfaces. */
export function CallFeatureProvider({ children, session, isMobileViewport, members, currentUser, chats, onOpenChat }: CallFeatureProviderProps) {
  return (
    <CallFeatureContext.Provider value={{ session, isMobileViewport, members, currentUser, chats, onOpenChat }}>
      {children}
    </CallFeatureContext.Provider>
  );
}

export function useCallFeatureContext() {
  const value = useContext(CallFeatureContext);
  if (!value) throw new Error("useCallFeatureContext must be used inside CallFeatureProvider");
  return value;
}
