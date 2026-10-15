import React, { useEffect, useRef, useState } from "react";
import { useStrings } from "../../../i18n/LanguageContext";

export type GroupCallPreJoinModalProps = {
  chatTitle?: string | null;
  callType: "audio" | "video";
  onClose: () => void;
  onJoin: (settings: { micMuted: boolean; cameraEnabled: boolean }) => void;
};

/**
 * Pre-Join Approval Modal: allows the user to preview camera/microphone state,
 * toggle mic and video settings, and explicitly confirm joining the group call.
 */
export function GroupCallPreJoinModal({
  chatTitle,
  callType,
  onClose,
  onJoin,
}: GroupCallPreJoinModalProps) {
  const copy = useStrings().sharedUi;
  const [micMuted, setMicMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(callType === "video");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  // Initialize camera preview if video is enabled
  useEffect(() => {
    let cancelled = false;

    async function initPreview() {
      if (!cameraEnabled) {
        if (previewStreamRef.current) {
          previewStreamRef.current.getTracks().forEach((track) => track.stop());
          previewStreamRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        previewStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      } catch (err) {
        console.warn("[GroupCallPreJoinModal] Camera preview failed:", err);
        setCameraEnabled(false);
      }
    }

    void initPreview();

    return () => {
      cancelled = true;
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((track) => track.stop());
        previewStreamRef.current = null;
      }
    };
  }, [cameraEnabled]);

  const handleConfirmJoin = () => {
    // Stop local preview stream tracks before passing control to CallSessionController
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((track) => track.stop());
      previewStreamRef.current = null;
    }
    onJoin({ micMuted, cameraEnabled });
  };

  return (
    <div className="group-call-prejoin-backdrop" role="dialog" aria-modal="true">
      <div className="group-call-prejoin-card">
        <div className="group-call-prejoin-header">
          <h2 className="group-call-prejoin-title">{copy.joinGroupCallQuestion}</h2>
          {chatTitle && <p className="group-call-prejoin-subtitle">{chatTitle}</p>}
        </div>

        {/* Media Preview Box */}
        <div className="group-call-prejoin-preview">
          {cameraEnabled ? (
            <video
              ref={videoRef}
              className="group-call-prejoin-video"
              muted
              playsInline
              autoPlay
            />
          ) : (
            <div className="group-call-prejoin-avatar-placeholder">
              <span className="ms-icon ms-icon--48" aria-hidden="true">
                {callType === "video" ? "videocam_off" : "mic"}
              </span>
              <p>{micMuted ? copy.microphoneMuted : copy.readyForAudio}</p>
            </div>
          )}
        </div>

        {/* Media Controls Toolbar */}
        <div className="group-call-prejoin-controls">
          <button
            type="button"
            className={`group-call-prejoin-btn${micMuted ? " is-off" : ""}`}
            onClick={() => setMicMuted(!micMuted)}
            aria-label={micMuted ? copy.unmuteMicrophone : copy.muteMicrophone}
          >
            <span className="ms-icon" aria-hidden="true">
              {micMuted ? "mic_off" : "mic"}
            </span>
            <span>{micMuted ? copy.muted : copy.micOn}</span>
          </button>

          {callType === "video" && (
            <button
              type="button"
              className={`group-call-prejoin-btn${!cameraEnabled ? " is-off" : ""}`}
              onClick={() => setCameraEnabled(!cameraEnabled)}
              aria-label={cameraEnabled ? copy.turnOffCamera : copy.turnOnCamera}
            >
              <span className="ms-icon" aria-hidden="true">
                {cameraEnabled ? "videocam" : "videocam_off"}
              </span>
              <span>{cameraEnabled ? copy.cameraOn : copy.cameraOff}</span>
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="group-call-prejoin-actions">
          <button
            type="button"
            className="group-call-prejoin-cancel-btn"
            onClick={onClose}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            className="group-call-prejoin-confirm-btn"
            onClick={handleConfirmJoin}
          >
            <svg
              className="group-call-join-svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span>{copy.joinCall}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
