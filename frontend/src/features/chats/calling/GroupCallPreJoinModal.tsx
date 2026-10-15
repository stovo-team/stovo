import React, { useEffect, useRef, useState } from "react";
import { PopupDialog } from "../../../components/ui/Popup";
import { PopupButton } from "../../../components/ui/PopupButton";

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
    <PopupDialog
      className="group-call-prejoin-card"
      ariaLabelledBy="group-call-prejoin-title"
      onClose={onClose}
      size="md"
    >
      <div className="group-call-prejoin-header">
        <h2 id="group-call-prejoin-title" className="group-call-prejoin-title">Join Group Call?</h2>
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
            <p>{micMuted ? "Microphone muted" : "Ready to join audio"}</p>
          </div>
        )}
      </div>

      {/* Media Controls Toolbar */}
      <div className="group-call-prejoin-controls">
        <button
          type="button"
          className={`group-call-prejoin-btn${micMuted ? " is-off" : ""}`}
          onClick={() => setMicMuted(!micMuted)}
          aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
        >
          <span className="ms-icon" aria-hidden="true">
            {micMuted ? "mic_off" : "mic"}
          </span>
          <span>{micMuted ? "Muted" : "Mic On"}</span>
        </button>

        {callType === "video" && (
          <button
            type="button"
            className={`group-call-prejoin-btn${!cameraEnabled ? " is-off" : ""}`}
            onClick={() => setCameraEnabled(!cameraEnabled)}
            aria-label={cameraEnabled ? "Turn off camera" : "Turn on camera"}
          >
            <span className="ms-icon" aria-hidden="true">
              {cameraEnabled ? "videocam" : "videocam_off"}
            </span>
            <span>{cameraEnabled ? "Camera On" : "Camera Off"}</span>
          </button>
        )}
      </div>

      {/* Action Buttons */}
      <div className="group-call-prejoin-actions">
        <PopupButton
          variant="secondary"
          className="group-call-prejoin-cancel-btn"
          onClick={onClose}
        >
          Cancel
        </PopupButton>
        <PopupButton
          variant="primary"
          className="group-call-prejoin-confirm-btn"
          onClick={handleConfirmJoin}
        >
          Join Call
        </PopupButton>
      </div>
    </PopupDialog>
  );
}
