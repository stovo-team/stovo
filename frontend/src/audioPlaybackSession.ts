import {
  NativeAudioPlaybackBackend,
  isNativeAudioPlaybackAvailable,
} from "./native/audioPlaybackPlugin";

export interface AudioIdentity {
  chatId: string;
  messageId: string;
  fileId: string;
}

export type AudioPlaybackPlatform = "web" | "android" | "unavailable";

export type AudioPlaybackStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "buffering"
  | "suppressed"
  | "ended"
  | "error"
  | "authorization-required";

export type AudioSuppressionReason = "call" | "video" | "focus" | null;

export type AudioPlaybackErrorCode =
  | "unavailable"
  | "network"
  | "unsupported"
  | "decode"
  | "playback-denied"
  | "authorization"
  | "unknown";

export interface AudioDescriptor {
  identity: AudioIdentity;
  title: string;
  /** Original attachment MIME type. Required by Media3 for extensionless media URLs. */
  mimeType?: string;
}

export interface AudioPlaybackSource {
  url: string;
  token?: string;
  mimeType?: string;
  objectUrl?: boolean;
}

export type AudioSourceFactory = (
  descriptor: AudioDescriptor,
) => Promise<AudioPlaybackSource>;

export interface AudioPlaybackSnapshot {
  identity: Readonly<AudioIdentity> | null;
  title: string;
  position: number;
  duration: number;
  bufferedPosition: number;
  status: AudioPlaybackStatus;
  playWhenReady: boolean;
  isPlaying: boolean;
  suppressionReason: AudioSuppressionReason;
  canSeek: boolean;
  error: AudioPlaybackErrorCode | null;
  revision: number;
  platform: AudioPlaybackPlatform;
}

export interface AudioPlaybackRestore {
  identity: AudioIdentity;
  title: string;
  position: number;
  duration: number;
}

export interface AudioPlaybackBackend {
  connect(): Promise<void>;
  getSnapshot(): AudioPlaybackSnapshot;
  subscribe(listener: (snapshot: AudioPlaybackSnapshot) => void): () => void;
  load(
    descriptor: AudioDescriptor,
    source: AudioPlaybackSource,
    position: number,
  ): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(position: number): Promise<void>;
  clear(): Promise<void>;
  setCallActive(active: boolean): Promise<void>;
  releaseSource?(source: AudioPlaybackSource): void;
  updateIdentity?(from: AudioIdentity, to: AudioIdentity): void;
}

export type AudioPlaybackClearReason =
  | "close"
  | "logout"
  | "user-switch"
  | "authorization"
  | "reset";

const playbackStatuses = new Set<AudioPlaybackStatus>([
  "idle",
  "loading",
  "ready",
  "playing",
  "paused",
  "buffering",
  "suppressed",
  "ended",
  "error",
  "authorization-required",
]);

const suppressionReasons = new Set<Exclude<AudioSuppressionReason, null>>([
  "call",
  "video",
  "focus",
]);

const playbackErrors = new Set<AudioPlaybackErrorCode>([
  "unavailable",
  "network",
  "unsupported",
  "decode",
  "playback-denied",
  "authorization",
  "unknown",
]);

const playbackPlatforms = new Set<AudioPlaybackPlatform>([
  "web",
  "android",
  "unavailable",
]);

export function sameAudioIdentity(
  left: AudioIdentity | null | undefined,
  right: AudioIdentity | null | undefined,
): boolean {
  return Boolean(
    left &&
      right &&
      left.chatId === right.chatId &&
      left.messageId === right.messageId &&
      left.fileId === right.fileId,
  );
}

function validIdentity(identity: AudioIdentity | null): identity is AudioIdentity {
  return Boolean(
    identity &&
      typeof identity.chatId === "string" &&
      identity.chatId.trim() &&
      typeof identity.messageId === "string" &&
      identity.messageId.trim() &&
      typeof identity.fileId === "string" &&
      identity.fileId.trim(),
  );
}

function normalizedFinite(value: number, fallback = 0): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clampPosition(position: number, duration: number): number {
  const finitePosition = normalizedFinite(position);
  return duration > 0 ? Math.min(finitePosition, duration) : finitePosition;
}

function immutableSnapshot(snapshot: AudioPlaybackSnapshot): AudioPlaybackSnapshot {
  const identity = snapshot.identity
    ? Object.freeze({ ...snapshot.identity })
    : null;
  return Object.freeze({ ...snapshot, identity });
}

function idleSnapshot(
  revision: number,
  platform: AudioPlaybackPlatform,
): AudioPlaybackSnapshot {
  return immutableSnapshot({
    identity: null,
    title: "",
    position: 0,
    duration: 0,
    bufferedPosition: 0,
    status: "idle",
    playWhenReady: false,
    isPlaying: false,
    suppressionReason: null,
    canSeek: false,
    error: null,
    revision,
    platform,
  });
}

export class AudioPlaybackSession {
  private snapshot: AudioPlaybackSnapshot;
  private descriptor: AudioDescriptor | null = null;
  private listeners = new Set<() => void>();
  private sequence = 0;
  private lastBackendRevision = -1;
  private connected = false;
  private loadGeneration = 0;
  private callActive = false;
  private readonly unsubscribeBackend: () => void;

  constructor(
    private readonly backend: AudioPlaybackBackend,
    private sourceFactory: AudioSourceFactory,
  ) {
    this.snapshot = idleSnapshot(0, backend.getSnapshot().platform);
    this.unsubscribeBackend = backend.subscribe((snapshot) => {
      this.acceptBackendSnapshot(snapshot);
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.connected = true;
    try {
      await this.backend.connect();
      this.acceptBackendSnapshot(this.backend.getSnapshot());
    } catch {
      this.connected = false;
      this.publish({
        status: "error",
        error: "unavailable",
        playWhenReady: false,
        isPlaying: false,
        platform: "unavailable",
      });
    }
  }

  getSnapshot(): AudioPlaybackSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Installs the current account's ephemeral source resolver. Credentials stay
   * inside the closure and are never copied to a snapshot or recovery state.
   */
  setSourceFactory(sourceFactory: AudioSourceFactory): void {
    this.sourceFactory = sourceFactory;
  }

  async load(descriptor: AudioDescriptor, position = 0): Promise<void> {
    this.assertDescriptor(descriptor);
    const replacing =
      this.snapshot.identity !== null &&
      !sameAudioIdentity(this.snapshot.identity, descriptor.identity);
    if (replacing) {
      await this.backend.pause();
      await this.backend.clear();
    }

    this.descriptor = {
      identity: { ...descriptor.identity },
      title: descriptor.title,
      mimeType: descriptor.mimeType,
    };
    await this.prepareCurrent(clampPosition(position, 0));
  }

  async play(): Promise<void> {
    if (!this.descriptor || this.callActive) return;
    const priorStatus = this.snapshot.status;
    // Authorization always needs a fresh credentialed load.
    if (priorStatus === "authorization-required") {
      await this.prepareCurrent(this.snapshot.position);
    } else if (priorStatus === "ended") {
      if (this.snapshot.platform === "android") {
        // Service stays alive after natural end — reload with a fresh token and
        // media item. seek+play alone is unreliable (async seek + stale creds).
        await this.prepareCurrent(0);
      } else {
        await this.backend.seek(0);
        this.publish({
          position: 0,
          status: "ready",
          playWhenReady: false,
          isPlaying: false,
          error: null,
        });
      }
    }
    const afterPrepare = this.snapshot.status;
    if (afterPrepare === "error") {
      return;
    }
    this.publish({
      playWhenReady: true,
      isPlaying: false,
      suppressionReason: null,
      // Preserve in-flight loading from prepareCurrent; otherwise advertise
      // buffering so the UI never sticks on a terminal ended/ready idle state.
      status:
        afterPrepare === "loading"
          ? "loading"
          : afterPrepare === "playing"
            ? "playing"
            : "buffering",
      error: null,
      position: priorStatus === "ended" ? 0 : this.snapshot.position,
    });
    try {
      await this.backend.play();
    } catch {
      this.publish({
        status: "error",
        playWhenReady: false,
        isPlaying: false,
        error: "playback-denied",
      });
    }
  }

  async pause(): Promise<void> {
    if (!this.snapshot.identity) return;
    await this.backend.pause();
    this.publish({
      status: "paused",
      playWhenReady: false,
      isPlaying: false,
      suppressionReason: null,
    });
  }

  async seek(position: number): Promise<void> {
    if (!this.snapshot.identity || !Number.isFinite(position)) return;
    const clamped = clampPosition(position, this.snapshot.duration);
    await this.backend.seek(clamped);
    this.publish({ position: clamped });
  }

  async retry(): Promise<void> {
    if (!this.descriptor) return;
    const retainedPosition = this.snapshot.position;
    await this.backend.pause();
    await this.prepareCurrent(retainedPosition);
  }

  async pauseForVideo(): Promise<void> {
    if (!this.snapshot.identity) return;
    await this.backend.pause();
    this.publish({
      status: "suppressed",
      playWhenReady: false,
      isPlaying: false,
      suppressionReason: "video",
    });
  }

  async setCallActive(active: boolean): Promise<void> {
    this.callActive = active;
    if (active && this.snapshot.identity) {
      await this.backend.pause();
    }
    await this.backend.setCallActive(active);
    if (!this.snapshot.identity) return;
    if (active) {
      this.publish({
        status: "suppressed",
        playWhenReady: false,
        isPlaying: false,
        suppressionReason: "call",
      });
    } else if (this.snapshot.suppressionReason === "call") {
      this.publish({
        status: "paused",
        playWhenReady: false,
        isPlaying: false,
        suppressionReason: null,
      });
    }
  }

  restore(restore: AudioPlaybackRestore): void {
    this.assertDescriptor(restore);
    const duration = normalizedFinite(restore.duration);
    const position = clampPosition(restore.position, duration);
    this.descriptor = {
      identity: { ...restore.identity },
      title: restore.title,
    };
    this.publish({
      identity: restore.identity,
      title: restore.title,
      position,
      duration,
      bufferedPosition: 0,
      status: "authorization-required",
      playWhenReady: false,
      isPlaying: false,
      suppressionReason: null,
      canSeek: duration > 0,
      error: null,
    });
  }

  updateIdentity(from: AudioIdentity, to: AudioIdentity): void {
    if (sameAudioIdentity(this.snapshot.identity, from)) {
      if (this.descriptor && sameAudioIdentity(this.descriptor.identity, from)) {
        this.descriptor = {
          ...this.descriptor,
          identity: { ...to },
        };
      }
      this.publish({
        identity: Object.freeze({ ...to }),
      });
      this.backend.updateIdentity?.(from, to);
    }
  }

  async clear(_reason: AudioPlaybackClearReason): Promise<void> {
    this.loadGeneration += 1;
    // Service/backend may restart and reissue low revisions after clear.
    this.lastBackendRevision = -1;
    await this.backend.clear();
    this.descriptor = null;
    this.callActive = false;
    this.snapshot = idleSnapshot(++this.sequence, this.snapshot.platform);
    this.emit();
  }

  destroy(): void {
    this.unsubscribeBackend();
    this.listeners.clear();
  }

  private async prepareCurrent(position: number): Promise<void> {
    if (!this.descriptor) return;
    const descriptor = {
      identity: { ...this.descriptor.identity },
      title: this.descriptor.title,
      mimeType: this.descriptor.mimeType,
    };
    const generation = ++this.loadGeneration;
    // Android stopSelf() after natural end restarts the service with revision 0.
    // Drop the watermark so the next backend snapshots are not treated as stale.
    this.lastBackendRevision = -1;
    this.publish({
      identity: descriptor.identity,
      title: descriptor.title,
      position,
      duration: this.snapshot.duration > 0 ? this.snapshot.duration : 0,
      bufferedPosition: 0,
      status: "loading",
      playWhenReady: false,
      isPlaying: false,
      suppressionReason: null,
      canSeek: this.snapshot.duration > 0,
      error: null,
    });

    try {
      const source = await this.sourceFactory(descriptor);
      if (
        generation !== this.loadGeneration ||
        !this.descriptor ||
        !sameAudioIdentity(this.descriptor.identity, descriptor.identity)
      ) {
        this.backend.releaseSource?.(source);
        return;
      }
      await this.backend.load(descriptor, source, position);
    } catch {
      if (generation !== this.loadGeneration) return;
      this.publish({
        status: "error",
        playWhenReady: false,
        isPlaying: false,
        error: "network",
      });
    }
  }

  private acceptBackendSnapshot(candidate: AudioPlaybackSnapshot): void {
    if (
      !Number.isSafeInteger(candidate.revision) ||
      candidate.revision <= this.lastBackendRevision
    ) {
      return;
    }
    this.lastBackendRevision = candidate.revision;

    const identity = validIdentity(candidate.identity) ? candidate.identity : null;
    if (candidate.identity !== null && !identity) return;
    const duration = normalizedFinite(candidate.duration);
    const position = clampPosition(candidate.position, duration);
    const bufferedPosition = clampPosition(candidate.bufferedPosition, duration);
    const status = playbackStatuses.has(candidate.status) ? candidate.status : "error";
    const suppressionReason =
      candidate.suppressionReason === null ||
      suppressionReasons.has(candidate.suppressionReason)
        ? candidate.suppressionReason
        : null;
    const terminal = status === "ended" || status === "error";
    const platform = playbackPlatforms.has(candidate.platform)
      ? candidate.platform
      : "unavailable";
    const error =
      candidate.error === null || playbackErrors.has(candidate.error)
        ? candidate.error
        : "unknown";

    if (identity) {
      this.descriptor = {
        identity: { ...identity },
        title: typeof candidate.title === "string" ? candidate.title : "",
        mimeType: sameAudioIdentity(this.descriptor?.identity, identity)
          ? this.descriptor?.mimeType
          : undefined,
      };
    }
    this.publish({
      identity,
      title: identity && typeof candidate.title === "string" ? candidate.title : "",
      position,
      duration,
      bufferedPosition,
      status,
      playWhenReady: terminal ? false : Boolean(candidate.playWhenReady),
      isPlaying:
        status === "playing" &&
        suppressionReason === null &&
        Boolean(candidate.isPlaying),
      suppressionReason,
      canSeek: Boolean(candidate.canSeek) && duration > 0,
      error,
      platform,
    });
  }

  private publish(update: Partial<AudioPlaybackSnapshot>): void {
    this.snapshot = immutableSnapshot({
      ...this.snapshot,
      ...update,
      revision: ++this.sequence,
    });
    this.emit();
  }

  private assertDescriptor(descriptor: AudioDescriptor): void {
    if (
      !descriptor ||
      !validIdentity(descriptor.identity) ||
      typeof descriptor.title !== "string"
    ) {
      throw new Error("Audio descriptor identity and title are required");
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export class WebAudioPlaybackBackend implements AudioPlaybackBackend {
  private readonly element: HTMLAudioElement;
  private snapshot = idleSnapshot(0, "web");
  private listeners = new Set<(snapshot: AudioPlaybackSnapshot) => void>();
  private descriptor: AudioDescriptor | null = null;
  private ownedObjectUrl: string | null = null;
  private pendingSeek: number | null = null;
  private active = false;

  constructor(
    elementFactory: () => HTMLAudioElement = () => new Audio(),
    private readonly revokeObjectUrl: (url: string) => void = (url) =>
      URL.revokeObjectURL(url),
  ) {
    this.element = elementFactory();
    this.registerMediaListeners();
  }

  async connect(): Promise<void> {}

  getSnapshot(): AudioPlaybackSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: AudioPlaybackSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(
    descriptor: AudioDescriptor,
    source: AudioPlaybackSource,
    position: number,
  ): Promise<void> {
    this.releaseOwnedObjectUrl();
    this.active = false;
    this.safePause();
    this.descriptor = {
      identity: { ...descriptor.identity },
      title: descriptor.title,
    };
    this.pendingSeek = normalizedFinite(position);

    if (!source.url?.trim()) {
      this.active = true;
      this.publish({
        identity: descriptor.identity,
        title: descriptor.title,
        status: "error",
        playWhenReady: false,
        isPlaying: false,
        error: "unsupported",
      });
      return;
    }

    this.ownedObjectUrl = source.objectUrl ? source.url : null;
    this.element.src = source.url;
    this.active = true;
    this.publish({
      identity: descriptor.identity,
      title: descriptor.title,
      position: this.pendingSeek,
      duration: 0,
      bufferedPosition: 0,
      status: "loading",
      playWhenReady: false,
      isPlaying: false,
      suppressionReason: null,
      canSeek: false,
      error: null,
    });
    try {
      this.element.load();
    } catch {
      this.publish({
        status: "error",
        error: "unsupported",
        playWhenReady: false,
        isPlaying: false,
      });
    }
  }

  async play(): Promise<void> {
    if (!this.active || !this.snapshot.identity) return;
    // HTMLMediaElement.play() is a no-op at the natural end unless we rewind first.
    if (this.element.ended || this.snapshot.status === "ended") {
      try {
        this.element.currentTime = 0;
      } catch {
        this.pendingSeek = 0;
      }
    }
    this.publish({
      playWhenReady: true,
      isPlaying: false,
      suppressionReason: null,
      status:
        this.snapshot.status === "ready" ||
        this.snapshot.status === "paused" ||
        this.snapshot.status === "ended"
          ? "buffering"
          : this.snapshot.status,
      error: null,
      position:
        this.element.ended || this.snapshot.status === "ended"
          ? 0
          : this.snapshot.position,
    });
    try {
      await this.element.play();
    } catch (err: unknown) {
      if (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      this.publish({
        status: "error",
        playWhenReady: false,
        isPlaying: false,
        error: "playback-denied",
      });
    }
  }

  async pause(): Promise<void> {
    if (!this.active) return;
    this.safePause();
    this.publish({
      status: "paused",
      playWhenReady: false,
      isPlaying: false,
      suppressionReason: null,
    });
  }

  async seek(position: number): Promise<void> {
    if (!this.active || !Number.isFinite(position)) return;
    const clamped = clampPosition(position, this.snapshot.duration);
    try {
      this.element.currentTime = clamped;
      this.pendingSeek = null;
      this.publish({ position: clamped });
    } catch {
      this.pendingSeek = clamped;
    }
  }

  async clear(): Promise<void> {
    this.active = false;
    this.descriptor = null;
    this.pendingSeek = null;
    this.safePause();
    try {
      this.element.removeAttribute("src");
      this.element.load();
    } catch {
      // A synthetic or already detached decoder can reject teardown commands.
    }
    this.releaseOwnedObjectUrl();
    this.snapshot = idleSnapshot(this.snapshot.revision + 1, "web");
    this.emit();
  }

  async setCallActive(active: boolean): Promise<void> {
    if (!this.active) return;
    if (active) {
      this.safePause();
      this.publish({
        status: "suppressed",
        playWhenReady: false,
        isPlaying: false,
        suppressionReason: "call",
      });
    } else if (this.snapshot.suppressionReason === "call") {
      this.publish({
        status: "paused",
        playWhenReady: false,
        isPlaying: false,
        suppressionReason: null,
      });
    }
  }

  releaseSource(source: AudioPlaybackSource): void {
    if (source.objectUrl && source.url) {
      this.revokeObjectUrl(source.url);
    }
  }

  updateIdentity(from: AudioIdentity, to: AudioIdentity): void {
    if (sameAudioIdentity(this.snapshot.identity, from)) {
      if (this.descriptor && sameAudioIdentity(this.descriptor.identity, from)) {
        this.descriptor = {
          ...this.descriptor,
          identity: { ...to },
        };
      }
      this.publish({
        identity: Object.freeze({ ...to }),
      });
    }
  }

  private registerMediaListeners(): void {
    // Do not re-enter "loading" on loadstart — that event also fires during
    // seek/replay and was leaving the UI stuck after the first successful play.
    this.element.addEventListener("loadedmetadata", () => {
      if (!this.active) return;
      const duration = normalizedFinite(this.element.duration);
      if (this.pendingSeek !== null) {
        const position = clampPosition(this.pendingSeek, duration);
        try {
          this.element.currentTime = position;
          this.pendingSeek = null;
        } catch {
          // Metadata can precede a usable seekable range; a later seek may retry.
        }
      }
      this.publish({
        duration,
        position: clampPosition(this.element.currentTime, duration),
        status: "ready",
        isPlaying: false,
        canSeek: duration > 0,
        error: null,
      });
    });
    this.element.addEventListener("durationchange", () => {
      if (!this.active) return;
      const duration = normalizedFinite(this.element.duration);
      this.publish({
        duration,
        position: clampPosition(this.element.currentTime, duration),
        canSeek: duration > 0,
      });
    });
    this.element.addEventListener("timeupdate", () => {
      if (!this.active) return;
      this.publish({
        position: clampPosition(this.element.currentTime, this.snapshot.duration),
      });
    });
    this.element.addEventListener("progress", () => {
      if (!this.active) return;
      let bufferedPosition = 0;
      try {
        if (this.element.buffered.length > 0) {
          bufferedPosition = this.element.buffered.end(
            this.element.buffered.length - 1,
          );
        }
      } catch {
        bufferedPosition = 0;
      }
      this.publish({
        bufferedPosition: clampPosition(
          bufferedPosition,
          this.snapshot.duration,
        ),
      });
    });
    this.element.addEventListener("play", () => {
      if (!this.active) return;
      this.publish({
        playWhenReady: true,
        isPlaying: false,
        status: "buffering",
        suppressionReason: null,
      });
    });
    this.element.addEventListener("waiting", () => {
      if (!this.active) return;
      this.publish({
        status: "buffering",
        playWhenReady: true,
        isPlaying: false,
      });
    });
    this.element.addEventListener("canplay", () => {
      if (!this.active || this.snapshot.isPlaying) return;
      this.publish({
        status: this.snapshot.playWhenReady ? "buffering" : "ready",
        isPlaying: false,
      });
    });
    this.element.addEventListener("playing", () => {
      if (!this.active) return;
      this.publish({
        status: "playing",
        playWhenReady: true,
        isPlaying: true,
        suppressionReason: null,
        error: null,
      });
    });
    this.element.addEventListener("pause", () => {
      if (!this.active || this.snapshot.status === "ended") return;
      this.publish({
        status: "paused",
        playWhenReady: false,
        isPlaying: false,
      });
    });
    this.element.addEventListener("ended", () => {
      if (!this.active) return;
      this.publish({
        position:
          this.snapshot.duration > 0
            ? this.snapshot.duration
            : normalizedFinite(this.element.currentTime),
        status: "ended",
        playWhenReady: false,
        isPlaying: false,
        suppressionReason: null,
      });
    });
    this.element.addEventListener("error", () => {
      if (!this.active) return;
      const code = this.element.error?.code;
      this.publish({
        status: "error",
        playWhenReady: false,
        isPlaying: false,
        error: code === 4 ? "unsupported" : code === 3 ? "decode" : "unknown",
      });
    });
  }

  private publish(update: Partial<AudioPlaybackSnapshot>): void {
    this.snapshot = immutableSnapshot({
      ...this.snapshot,
      ...update,
      revision: this.snapshot.revision + 1,
      platform: "web",
    });
    this.emit();
  }

  private safePause(): void {
    try {
      this.element.pause();
    } catch {
      // Detached and synthetic media elements may reject imperative pause.
    }
  }

  private releaseOwnedObjectUrl(): void {
    if (!this.ownedObjectUrl) return;
    const url = this.ownedObjectUrl;
    this.ownedObjectUrl = null;
    this.revokeObjectUrl(url);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

class UnavailableAudioPlaybackBackend implements AudioPlaybackBackend {
  private snapshot = idleSnapshot(0, "unavailable");

  async connect(): Promise<void> {}

  getSnapshot(): AudioPlaybackSnapshot {
    return this.snapshot;
  }

  subscribe(): () => void {
    return () => undefined;
  }

  async load(): Promise<void> {
    this.snapshot = immutableSnapshot({
      ...this.snapshot,
      status: "error",
      error: "unavailable",
      revision: this.snapshot.revision + 1,
    });
  }

  async play(): Promise<void> {}
  async pause(): Promise<void> {}
  async seek(): Promise<void> {}
  async clear(): Promise<void> {
    this.snapshot = idleSnapshot(this.snapshot.revision + 1, "unavailable");
  }
  async setCallActive(): Promise<void> {}
}

const unavailableSourceFactory: AudioSourceFactory = async () => {
  throw new Error("Audio playback source is unavailable");
};

export function createAudioPlaybackSession(
  backend: AudioPlaybackBackend =
    isNativeAudioPlaybackAvailable()
      ? new NativeAudioPlaybackBackend()
      : typeof Audio === "undefined"
      ? new UnavailableAudioPlaybackBackend()
      : new WebAudioPlaybackBackend(),
  sourceFactory: AudioSourceFactory = unavailableSourceFactory,
): AudioPlaybackSession {
  return new AudioPlaybackSession(backend, sourceFactory);
}

export const audioPlaybackSession = createAudioPlaybackSession();
