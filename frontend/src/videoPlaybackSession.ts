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
  _left: VideoIdentity | null | undefined,
  _right: VideoIdentity | null | undefined,
): boolean {
  return false;
}

export class VideoPlaybackSession {
  attach(_identity: VideoIdentity, _element: HTMLVideoElement): VideoPlaybackRegistration {
    throw new Error("Video playback session is not implemented");
  }

  detach(_registration: VideoPlaybackRegistration): void {}

  activate(_registration: VideoPlaybackRegistration): boolean {
    return false;
  }

  update(
    _registration: VideoPlaybackRegistration,
    _update: VideoPlaybackUpdate,
    _revision?: number,
  ): boolean {
    return false;
  }

  performAction(_registration: VideoPlaybackRegistration, _action: VideoPlaybackAction): boolean {
    return false;
  }

  issueRevision(): number {
    return 0;
  }

  getSnapshot(_identity?: VideoIdentity): VideoPlaybackSnapshot | null {
    return null;
  }

  subscribe(_listener: () => void): () => void {
    return () => undefined;
  }

  reset(): void {}
}

export const videoPlaybackSession = new VideoPlaybackSession();
