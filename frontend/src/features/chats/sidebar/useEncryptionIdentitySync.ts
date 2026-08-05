import { Dispatch, SetStateAction, useEffect } from "react";

import type { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import { ensureLocalEncryptionIdentity } from "../../../api/messageCrypto";

export type UseEncryptionIdentitySyncParams = {
  currentUser: User | null;
  authRequest: <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;
  updateCurrentUser: (user: User) => void;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setSelectedChat: Dispatch<SetStateAction<Chat | null>>;
};

/**
 * Ensures the local end-to-end encryption keypair exists and that its public
 * key is published on the current user's account, propagating any change
 * into already-loaded chat member lists.
 */
export function useEncryptionIdentitySync({
  currentUser,
  authRequest,
  updateCurrentUser,
  setChats,
  setSelectedChat
}: UseEncryptionIdentitySyncParams) {
  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }
    const userId = currentUser.id;
    const existingPublicKey = currentUser.publicKey;
    void (async () => {
      const publicKey = await ensureLocalEncryptionIdentity();
      if (publicKey !== existingPublicKey) {
        const updated = await authRequest<User>("/api/auth/me", {
          method: "PATCH",
          body: { publicKey }
        });
        updateCurrentUser(updated);
        setChats((current) =>
          current.map((chat) => ({
            ...chat,
            members: chat.members.map((member) =>
              member.id === updated.id ? { ...member, publicKey: updated.publicKey } : member
            )
          }))
        );
        setSelectedChat((chat) =>
          chat
            ? {
                ...chat,
                members: chat.members.map((member) =>
                  member.id === updated.id ? { ...member, publicKey: updated.publicKey } : member
                )
              }
            : chat
        );
      }
    })().catch(() => undefined);
    // Intentionally depend on user id + published key only — not the whole
    // currentUser object — so unrelated user field updates cannot re-run this.
  }, [authRequest, currentUser?.id, currentUser?.publicKey, setChats, setSelectedChat, updateCurrentUser]);
}
