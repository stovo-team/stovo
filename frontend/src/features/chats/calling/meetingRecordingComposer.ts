import type { MutableRefObject } from "react";
import { DESIGN_COLOR_VALUES } from "../../../design-system/palette";

export type RecordingMediaSources = {
  localStream?: MediaStream | null;
  localScreenStream?: MediaStream | null;
  remoteStreams: { cameraStream: MediaStream | null; screenStream?: MediaStream | null }[];
};

type MeetingVideo = { id: string; video: HTMLVideoElement };

function liveVideoTrack(stream?: MediaStream | null) {
  return stream?.getVideoTracks().find((track) => track.readyState === "live") ?? null;
}

function drawVideo(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, x: number, y: number, width: number, height: number) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (sourceWidth <= 0 || sourceHeight <= 0) return false;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawnWidth = sourceWidth * scale;
  const drawnHeight = sourceHeight * scale;
  ctx.drawImage(video, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
  return true;
}

/**
 * Produces one video track that continuously mirrors the current meeting
 * layout. Unlike recording an individual MediaStream track, this keeps remote
 * participants, local video, and screen sharing in the saved recording.
 */
export function createMeetingRecordingVideoTrack(sourcesRef: MutableRefObject<RecordingMediaSources>) {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  const canvasStream = canvas.captureStream(24);
  const track = canvasStream.getVideoTracks()[0];
  if (!context || !track) throw new Error("Meeting video recording is not supported in this browser");

  const videos = new Map<string, MeetingVideo>();
  let animationFrame: number | null = null;
  let stopped = false;
  let hasVideoFrames = false;

  const getVideo = (stream?: MediaStream | null) => {
    const sourceTrack = liveVideoTrack(stream);
    if (!sourceTrack) return null;
    let source = videos.get(sourceTrack.id);
    if (!source) {
      const video = document.createElement("video");
      video.autoplay = true;
      video.defaultMuted = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = new MediaStream([sourceTrack]);
      void video.play().catch(() => undefined);
      source = { id: sourceTrack.id, video };
      videos.set(sourceTrack.id, source);
    }
    return source;
  };

  const paint = () => {
    const { localStream, localScreenStream, remoteStreams } = sourcesRef.current;
    const screen = getVideo(localScreenStream) ?? remoteStreams.map((stream) => getVideo(stream.screenStream)).find(Boolean) ?? null;
    const cameras = [getVideo(localStream), ...remoteStreams.map((stream) => getVideo(stream.cameraStream))].filter((source): source is MeetingVideo => Boolean(source));
    const activeIDs = new Set([screen?.id, ...cameras.map((source) => source.id)].filter((id): id is string => Boolean(id)));
    for (const [id, source] of videos) {
      if (!activeIDs.has(id)) {
        source.video.srcObject = null;
        videos.delete(id);
      }
    }

    context.fillStyle = DESIGN_COLOR_VALUES.native.meetingRecordingBackground;
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (screen && screen.video.videoWidth > 0 && screen.video.videoHeight > 0) {
      hasVideoFrames = drawVideo(context, screen.video, 0, 0, canvas.width, canvas.height) || hasVideoFrames;
      const tileHeight = Math.min(190, canvas.height * 0.26);
      const tileWidth = cameras.length ? canvas.width / Math.min(cameras.length, 4) : 0;
      cameras.filter((source) => source.video.videoWidth > 0 && source.video.videoHeight > 0).slice(0, 4).forEach((source, index) => {
        hasVideoFrames = drawVideo(context, source.video, index * tileWidth, canvas.height - tileHeight, tileWidth, tileHeight) || hasVideoFrames;
      });
    } else if (cameras.some((source) => source.video.videoWidth > 0 && source.video.videoHeight > 0)) {
      const readyCameras = cameras.filter((source) => source.video.videoWidth > 0 && source.video.videoHeight > 0);
      const columns = Math.ceil(Math.sqrt(readyCameras.length));
      const rows = Math.ceil(readyCameras.length / columns);
      const tileWidth = canvas.width / columns;
      const tileHeight = canvas.height / rows;
      readyCameras.forEach((source, index) => {
        hasVideoFrames = drawVideo(context, source.video, (index % columns) * tileWidth, Math.floor(index / columns) * tileHeight, tileWidth, tileHeight) || hasVideoFrames;
      });
    } else {
      context.fillStyle = DESIGN_COLOR_VALUES.native.meetingRecordingForeground;
      context.font = "600 28px sans-serif";
      context.textAlign = "center";
      context.fillText("Waiting for meeting video", canvas.width / 2, canvas.height / 2);
    }

    if (!stopped) animationFrame = window.requestAnimationFrame(paint);
  };

  paint();
  return {
    track,
    get hasVideoFrames() { return hasVideoFrames; },
    stop: () => {
      stopped = true;
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      for (const source of videos.values()) source.video.srcObject = null;
      videos.clear();
      canvasStream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
    },
  };
}
