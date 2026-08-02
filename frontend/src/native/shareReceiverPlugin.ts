import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeSharedFile = {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

type NativeShareReceiverPlugin = {
  consumePendingShares(): Promise<{ files: NativeSharedFile[]; skippedCount: number }>;
  releasePendingShares(options: { ids: string[] }): Promise<void>;
  addListener(
    eventName: "sharesReceived",
    listener: () => void
  ): Promise<{ remove: () => Promise<void> }>;
};

export type ReceivedSharedFiles = {
  files: File[];
  skippedCount: number;
};

const ShareReceiverPlugin = registerPlugin<NativeShareReceiverPlugin>("ShareReceiverPlugin");

function isAndroidShareReceiverAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function addNativeShareListener(onShareReceived: () => void): Promise<() => void> {
  if (!isAndroidShareReceiverAvailable()) {
    return () => undefined;
  }
  try {
    const handle = await ShareReceiverPlugin.addListener("sharesReceived", onShareReceived);
    return () => {
      void handle.remove();
    };
  } catch {
    return () => undefined;
  }
}

export async function consumeNativeSharedFiles(
  fetcher: typeof fetch = fetch
): Promise<ReceivedSharedFiles> {
  if (!isAndroidShareReceiverAvailable()) {
    return { files: [], skippedCount: 0 };
  }

  try {
    const pending = await ShareReceiverPlugin.consumePendingShares();
    const files: File[] = [];
    const ids: string[] = [];
    let skippedCount = Number.isFinite(pending.skippedCount) ? pending.skippedCount : 0;

    for (const shared of pending.files ?? []) {
      ids.push(shared.id);
      try {
        const response = await fetcher(Capacitor.convertFileSrc(shared.path));
        if (!response.ok) {
          skippedCount += 1;
          continue;
        }
        const blob = await response.blob();
        files.push(new File([blob], shared.name, { type: shared.mimeType || blob.type }));
      } catch {
        skippedCount += 1;
      }
    }

    if (ids.length > 0) {
      await ShareReceiverPlugin.releasePendingShares({ ids }).catch(() => undefined);
    }
    return { files, skippedCount };
  } catch {
    return { files: [], skippedCount: 0 };
  }
}
