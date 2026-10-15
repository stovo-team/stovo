import { CallDevice } from "../../../realtime/CallController";
import { PopupBackdrop } from "../../../components/ui/Popup";

export function CallSpeakerSheet({
  devices,
  currentOutputDeviceId,
  speakerMode,
  onSelect,
  onClose,
}: {
  devices: CallDevice[];
  currentOutputDeviceId: string;
  speakerMode: "small" | "large";
  onSelect: (deviceId: string | null, mode: "small" | "large") => void;
  onClose: () => void;
}) {
  const outputDevices = devices.filter((d) => d.kind === "audiooutput");
  const hasEnumerable = outputDevices.length > 0;

  return (
    <PopupBackdrop
      className="call-speaker-sheet-backdrop"
      onClick={onClose}
    >
      <div className="call-speaker-sheet" role="dialog" aria-label="Audio output" onClick={(e) => e.stopPropagation()}>
        <div className="call-speaker-sheet-title">Audio output</div>

        {!hasEnumerable && (
          <>
            <button
              type="button"
              className="call-speaker-sheet-item"
              onClick={() => { onSelect(null, "small"); onClose(); }}
            >
              <svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              <span className="call-speaker-sheet-label">Earpiece</span>
              <span className="call-speaker-sheet-check-slot" aria-hidden="true">
                {speakerMode === "small" && !currentOutputDeviceId && (
                  <svg className="call-speaker-sheet-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </span>
            </button>
            <button
              type="button"
              className="call-speaker-sheet-item"
              onClick={() => { onSelect(null, "large"); onClose(); }}
            >
              <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></svg>
              <span className="call-speaker-sheet-label">Speaker</span>
              <span className="call-speaker-sheet-check-slot" aria-hidden="true">
                {speakerMode === "large" && !currentOutputDeviceId && (
                  <svg className="call-speaker-sheet-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </span>
            </button>
          </>
        )}

        {hasEnumerable && outputDevices.map((d) => (
          <button
            key={d.deviceId}
            type="button"
            className="call-speaker-sheet-item"
            onClick={() => { onSelect(d.deviceId, "large"); onClose(); }}
          >
            {d.deviceId === "default" || d.label.toLowerCase().includes("speaker")
              ? <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></svg>
              : <svg viewBox="0 0 24 24"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/></svg>
            }
            <span className="call-speaker-sheet-label">{d.label || "Audio output"}</span>
            <span className="call-speaker-sheet-check-slot" aria-hidden="true">
              {currentOutputDeviceId === d.deviceId && (
                <svg className="call-speaker-sheet-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </span>
          </button>
        ))}
      </div>
    </PopupBackdrop>
  );
}
