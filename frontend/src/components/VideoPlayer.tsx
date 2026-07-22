import type { FamilyFile } from "../api/files";
import type { VideoIdentity } from "../videoPlaybackSession";

export interface VideoPlayerProps {
  file: FamilyFile;
  accessToken: string;
  identity: VideoIdentity;
  disabledReason?: string;
}

export function formatVideoTime(_seconds: number): string {
  return "0:00";
}

export function VideoPlayer(_props: VideoPlayerProps) {
  return <div className="video-player" />;
}
