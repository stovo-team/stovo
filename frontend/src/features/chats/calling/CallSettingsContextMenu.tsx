import { RefObject, useLayoutEffect, useState } from "react";
import { SlidersHorizontal, Video } from "lucide-react";
import { useStrings } from "../../../i18n/LanguageContext";

export function CallSettingsContextMenu({
  anchorRef,
  menuRef,
  onOpenAudioSettings,
  onOpenVideoSettings,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  onOpenAudioSettings: () => void;
  onOpenVideoSettings: () => void;
}) {
  const copy = useStrings().callAudio;
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    const btn = anchorRef.current;
    if (!btn) return;
    const update = () => {
      const rect = btn.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [anchorRef]);

  if (!pos) return null;

  return (
    <div
      ref={menuRef}
      className="call-settings-context-menu"
      style={{ top: pos.top, right: pos.right }}
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        className="call-settings-context-item"
        onClick={onOpenAudioSettings}
      >
        <SlidersHorizontal aria-hidden="true" size={14} />
        {copy.settings}
      </button>
      <button
        type="button"
        role="menuitem"
        className="call-settings-context-item"
        onClick={onOpenVideoSettings}
      >
        <Video aria-hidden="true" size={14} />
        {copy.videoSettings}
      </button>
    </div>
  );
}
