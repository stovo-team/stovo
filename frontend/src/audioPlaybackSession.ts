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
}

export interface AudioPlaybackSource {
  url: string;
  token?: string;
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
    private readonly sourceFactory: AudioSourceFactory,
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
    };
    await this.prepareCurrent(clampPosition(position, 0));
  }

  async play(): Promise<void> {
    if (!this.descriptor || this.callActive) return;
    if (this.snapshot.status === "authorization-required") {
      await this.prepareCurrent(this.snapshot.position);
    }
    this.publish({
      playWhenReady: true,
      isPlaying: false,
      suppressionReason: null,
      status: this.snapshot.status === "ended" ? "ready" : this.snapshot.status,
      error: null,
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

  async clear(_reason: AudioPlaybackClearReason): Promise<void> {
    this.loadGeneration += 1;
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
    };
    const generation = ++this.loadGeneration;
    this.publish({
      identity: descriptor.identity,
      title: descriptor.title,
      position,
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
      const source = await this.sourceFactory(descriptor);
      if (
        generation !== this.loadGeneration ||
        !this.descriptor ||
        !sameAudioIdentity(this.descriptor.identity, descriptor.identity)
      ) {
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
  backend: AudioPlaybackBackend = new UnavailableAudioPlaybackBackend(),
  sourceFactory: AudioSourceFactory = unavailableSourceFactory,
): AudioPlaybackSession {
  return new AudioPlaybackSession(backend, sourceFactory);
}

export const audioPlaybackSession = createAudioPlaybackSession();
