import type { RemoteMedia } from "../../../realtime/call/types";

export function hasScreenSharePresentation(
  mockScreenShareUserId: string | null | undefined,
  localScreenStream: MediaStream | null | undefined,
  remoteMedia: RemoteMedia[] | null | undefined,
): boolean {
  return Boolean(
    mockScreenShareUserId ||
    localScreenStream?.getVideoTracks().some((track) => track.readyState !== "ended") ||
    remoteMedia?.some((media) => media.hasScreenShare && (
      media.userId === mockScreenShareUserId ||
      media.screenStream?.getVideoTracks().some((track) => track.readyState !== "ended")
    )),
  );
}
