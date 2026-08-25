/**
 * Read/write seam used while Stovo moves from the legacy browser cache to the
 * native encrypted replica. The adapter is deliberately generic: existing
 * screen cache shapes stay unchanged until the authoritative replica schema is
 * introduced, and a partial native migration cannot make cached screens blank.
 */
export type LocalReplicaReadAdapter<TChats, TMessage extends { id: string }> = {
  loadChats(userId: string): Promise<TChats[] | null>;
  saveChats(userId: string, chats: TChats[]): Promise<void>;
  loadMessages(userId: string, chatId: string): Promise<TMessage[] | null>;
  saveMessages(userId: string, chatId: string, messages: TMessage[]): Promise<void>;
  clear(userId?: string): Promise<void>;
};

export type ReplicaMigrationStore<TChats, TMessage extends { id: string }> =
  LocalReplicaReadAdapter<TChats, TMessage> & { isReady(): Promise<boolean> };

/**
 * Uses native only after it explicitly reports a complete replica. Any native
 * error or incomplete schema falls through to legacy storage, preserving the
 * app's current startup behavior during staged releases and rollbacks.
 */
export function createMigrationSafeReadAdapter<TChats, TMessage extends { id: string }>(
  legacy: LocalReplicaReadAdapter<TChats, TMessage>,
  native: ReplicaMigrationStore<TChats, TMessage>
): LocalReplicaReadAdapter<TChats, TMessage> {
  async function useNative(): Promise<boolean> {
    try {
      return await native.isReady();
    } catch {
      return false;
    }
  }

  return {
    async loadChats(userId) {
      if (await useNative()) {
        try {
          const value = await native.loadChats(userId);
          if (value !== null) return value;
        } catch {
          // A partially migrated profile must still render its legacy cache.
        }
      }
      return legacy.loadChats(userId);
    },
    async saveChats(userId, chats) {
      if (await useNative()) {
        try {
          await native.saveChats(userId, chats);
          return;
        } catch {
          // Continue to legacy persistence until native writes are reliable.
        }
      }
      await legacy.saveChats(userId, chats);
    },
    async loadMessages(userId, chatId) {
      if (await useNative()) {
        try {
          const value = await native.loadMessages(userId, chatId);
          if (value !== null) return value;
        } catch {
          // See loadChats.
        }
      }
      return legacy.loadMessages(userId, chatId);
    },
    async saveMessages(userId, chatId, messages) {
      if (await useNative()) {
        try {
          await native.saveMessages(userId, chatId, messages);
          return;
        } catch {
          // See saveChats.
        }
      }
      await legacy.saveMessages(userId, chatId, messages);
    },
    async clear(userId) {
      // Clear both stores. This is intentionally not short-circuited: logout
      // must never leave legacy plaintext cache behind after native rollout.
      await Promise.allSettled([native.clear(userId), legacy.clear(userId)]);
    }
  };
}
