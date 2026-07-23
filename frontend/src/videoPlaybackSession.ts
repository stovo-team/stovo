export interface VideoIdentity {
  chatId: string;
  messageId: string;
  fileId: string;
}

export type VideoPlaybackStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "waiting"
  | "ended"
  | "error";

export interface VideoPlaybackSnapshot {
  identity: VideoIdentity;
  currentTime: number;
  duration: number;
  muted: boolean;
  playIntent: boolean;
  status: VideoPlaybackStatus;
  error: string | null;
  revision: number;
}

export interface VideoPlaybackRegistration {
  identity: VideoIdentity;
  token: number;
  snapshot: VideoPlaybackSnapshot;
}

export type VideoPlaybackUpdate = Partial<
  Pick<
    VideoPlaybackSnapshot,
    "currentTime" | "duration" | "muted" | "playIntent" | "status" | "error"
  >
>;

export type VideoPlaybackAction =
  | { type: "play" }
  | { type: "pause" }
  | { type: "seek"; currentTime: number }
  | { type: "mute"; muted: boolean };

export function sameVideoIdentity(
  left: VideoIdentity | null | undefined,
  right: VideoIdentity | null | undefined,
): boolean {
  return Boolean(
    left &&
      right &&
      left.chatId === right.chatId &&
      left.messageId === right.messageId &&
      left.fileId === right.fileId,
  );
}

export class VideoPlaybackSession {
  private snapshots: VideoPlaybackSnapshot[] = [];
  private registrations: Array<{
    identity: VideoIdentity;
    token: number;
    element: HTMLVideoElement;
  }> = [];
  private activeIdentity: VideoIdentity | null = null;
  private listeners = new Set<() => void>();
  private sequence = 0;

  attach(identity: VideoIdentity, element: HTMLVideoElement): VideoPlaybackRegistration {
    this.assertIdentity(identity);
    const stableIdentity = { ...identity };
    const existingRegistration = this.findRegistration(stableIdentity);
    if (existingRegistration && existingRegistration.element !== element) {
      this.safePause(existingRegistration.element);
    }

    const token = ++this.sequence;
    this.registrations = this.registrations.filter(
      (registration) => !sameVideoIdentity(registration.identity, stableIdentity),
    );
    this.registrations.push({ identity: stableIdentity, token, element });

    let snapshot = this.findSnapshot(stableIdentity);
    if (!snapshot) {
      snapshot = {
        identity: stableIdentity,
        currentTime: 0,
        duration: 0,
        muted: false,
        playIntent: false,
        status: "idle",
        error: null,
        revision: ++this.sequence,
      };
      this.snapshots.push(snapshot);
    }

    this.restoreElement(element, snapshot);
    return { identity: stableIdentity, token, snapshot };
  }

  detach(registration: VideoPlaybackRegistration): void {
    if (!this.isCurrentRegistration(registration)) return;
    this.registrations = this.registrations.filter(
      (current) => current.token !== registration.token,
    );
  }

  activate(registration: VideoPlaybackRegistration): boolean {
    if (!this.isCurrentRegistration(registration)) return false;

    if (sameVideoIdentity(this.activeIdentity, registration.identity)) {
      const snapshot = this.findSnapshot(registration.identity);
      if (snapshot && !snapshot.playIntent) {
        this.replaceSnapshot(snapshot, {
          ...snapshot,
          playIntent: true,
          error: null,
          revision: this.issueRevision(),
        });
        this.emit();
      }
      return true;
    }

    if (this.activeIdentity) {
      const formerRegistration = this.findRegistration(this.activeIdentity);
      if (formerRegistration) this.safePause(formerRegistration.element);
      const formerSnapshot = this.findSnapshot(this.activeIdentity);
      if (formerSnapshot) {
        this.replaceSnapshot(formerSnapshot, {
          ...formerSnapshot,
          playIntent: false,
          status: formerSnapshot.status === "error" ? "error" : "paused",
          revision: this.issueRevision(),
        });
      }
    }

    this.activeIdentity = { ...registration.identity };
    const snapshot = this.findSnapshot(registration.identity);
    if (snapshot) {
      this.replaceSnapshot(snapshot, {
        ...snapshot,
        playIntent: true,
        status: snapshot.status === "ended" ? "ready" : snapshot.status,
        error: null,
        revision: this.issueRevision(),
      });
    }
    this.emit();
    return true;
  }

  update(
    registration: VideoPlaybackRegistration,
    update: VideoPlaybackUpdate,
    revision = this.issueRevision(),
  ): boolean {
    if (!this.isCurrentRegistration(registration)) return false;
    const snapshot = this.findSnapshot(registration.identity);
    if (!snapshot || !Number.isSafeInteger(revision) || revision <= snapshot.revision) return false;
    this.sequence = Math.max(this.sequence, revision);

    const duration = this.normalizeDuration(update.duration, snapshot.duration);
    let currentTime = this.normalizeCurrentTime(update.currentTime, snapshot.currentTime);
    if (duration > 0) currentTime = Math.min(currentTime, duration);
    const status = update.status ?? snapshot.status;
    const terminal = status === "ended" || status === "error";
    const next: VideoPlaybackSnapshot = {
      identity: snapshot.identity,
      currentTime,
      duration,
      muted: update.muted ?? snapshot.muted,
      playIntent: terminal ? false : (update.playIntent ?? snapshot.playIntent),
      status,
      error: update.error === undefined ? snapshot.error : update.error,
      revision,
    };
    this.replaceSnapshot(snapshot, next);
    registration.snapshot = next;

    if (terminal && sameVideoIdentity(this.activeIdentity, registration.identity)) {
      this.activeIdentity = null;
    }
    this.emit();
    return true;
  }

  performAction(registration: VideoPlaybackRegistration, action: VideoPlaybackAction): boolean {
    const current = this.currentRegistration(registration);
    if (!current) return false;

    switch (action.type) {
      case "play":
        return this.activate(registration);
      case "pause":
        this.safePause(current.element);
        return this.update(registration, { status: "paused", playIntent: false });
      case "seek": {
        const snapshot = this.findSnapshot(registration.identity);
        if (!snapshot || !Number.isFinite(action.currentTime)) return false;
        const currentTime = Math.min(
          Math.max(0, action.currentTime),
          snapshot.duration > 0 ? snapshot.duration : Number.POSITIVE_INFINITY,
        );
        try {
          current.element.currentTime = currentTime;
        } catch {
          return false;
        }
        return this.update(registration, { currentTime });
      }
      case "mute":
        current.element.muted = action.muted;
        return this.update(registration, { muted: action.muted });
    }
  }

  pauseActive(): boolean {
    if (!this.activeIdentity) return false;
    const registration = this.findRegistration(this.activeIdentity);
    const snapshot = this.findSnapshot(this.activeIdentity);
    if (!registration || !snapshot) return false;

    this.safePause(registration.element);
    this.replaceSnapshot(snapshot, {
      ...snapshot,
      playIntent: false,
      status: "paused",
      revision: this.issueRevision(),
    });
    this.emit();
    return true;
  }

  issueRevision(): number {
    return ++this.sequence;
  }

  getSnapshot(identity?: VideoIdentity): VideoPlaybackSnapshot | null {
    if (identity) return this.findSnapshot(identity) ?? null;
    if (!this.activeIdentity) return null;
    return this.findSnapshot(this.activeIdentity) ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.registrations.forEach(({ element }) => this.safePause(element));
    this.registrations = [];
    this.snapshots = [];
    this.activeIdentity = null;
    this.emit();
  }

  private assertIdentity(identity: VideoIdentity): void {
    if (
      !identity ||
      typeof identity.chatId !== "string" ||
      typeof identity.messageId !== "string" ||
      typeof identity.fileId !== "string" ||
      !identity.chatId.trim() ||
      !identity.messageId.trim() ||
      !identity.fileId.trim()
    ) {
      throw new Error("Video identity fields are required");
    }
  }

  private findSnapshot(identity: VideoIdentity): VideoPlaybackSnapshot | undefined {
    return this.snapshots.find((snapshot) => sameVideoIdentity(snapshot.identity, identity));
  }

  private replaceSnapshot(
    previous: VideoPlaybackSnapshot,
    next: VideoPlaybackSnapshot,
  ): void {
    this.snapshots = this.snapshots.map((snapshot) => (snapshot === previous ? next : snapshot));
  }

  private findRegistration(identity: VideoIdentity) {
    return this.registrations.find((registration) =>
      sameVideoIdentity(registration.identity, identity),
    );
  }

  private currentRegistration(registration: VideoPlaybackRegistration) {
    const current = this.findRegistration(registration.identity);
    return current?.token === registration.token ? current : undefined;
  }

  private isCurrentRegistration(registration: VideoPlaybackRegistration): boolean {
    return Boolean(this.currentRegistration(registration));
  }

  private normalizeDuration(value: number | undefined, fallback: number): number {
    return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  private normalizeCurrentTime(value: number | undefined, fallback: number): number {
    return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : fallback;
  }

  private restoreElement(element: HTMLVideoElement, snapshot: VideoPlaybackSnapshot): void {
    try {
      element.currentTime = snapshot.currentTime;
    } catch {
      // Some engines reject currentTime before metadata; loadedmetadata retries it.
    }
    element.muted = snapshot.muted;
  }

  private safePause(element: HTMLVideoElement): void {
    try {
      element.pause();
    } catch {
      // Detached or synthetic media elements may reject imperative actions.
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const videoPlaybackSession = new VideoPlaybackSession();
