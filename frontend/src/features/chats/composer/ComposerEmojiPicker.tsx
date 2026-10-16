import type { RefObject } from "react";
import CspSafeEmojiPicker, { type EmojiClickData, Theme } from "../../../components/CspSafeEmojiPicker";
import { Smile } from "lucide-react";

import { EMOJI_CATEGORY_ICONS } from "./emojiCategories";
import { useStrings } from "../../../i18n/LanguageContext";

type ComposerEmojiPickerProps = {
  open: boolean;
  showDocked: boolean;
  theme: "light" | "dark";
  disabled: boolean;
  pickerRef: RefObject<HTMLDivElement | null>;
  dockRef: RefObject<HTMLDivElement | null>;
  onToggle: () => void;
  onEmojiPick: (emoji: EmojiClickData) => void;
};

function Picker({ theme, onEmojiPick, docked = false }: Pick<ComposerEmojiPickerProps, "theme" | "onEmojiPick"> & { docked?: boolean }) {
  return <CspSafeEmojiPicker onEmojiClick={onEmojiPick} autoFocusSearch={false} lazyLoadEmojis previewConfig={{ showPreview: false }} searchDisabled skinTonesDisabled categoryIcons={EMOJI_CATEGORY_ICONS} theme={theme === "light" ? Theme.LIGHT : Theme.DARK} width={docked ? "100%" : 360} height={380} />;
}

export function ComposerEmojiPicker({ open, showDocked, theme, disabled, pickerRef, onToggle, onEmojiPick }: ComposerEmojiPickerProps) {
  const strings = useStrings();
  const copy = strings.attachments;
  return <div className="emoji-picker-shell" ref={pickerRef}>
      <button type="button" className="emoji-picker-button" aria-label={copy.addEmoji} aria-expanded={open} title={copy.addEmoji} disabled={disabled} onClick={onToggle}><Smile aria-hidden="true" size={22} /></button>
      {!showDocked && open && <div className="emoji-picker" role="menu" aria-label={copy.chooseEmoji}><Picker theme={theme} onEmojiPick={onEmojiPick} /></div>}
    </div>;
}

export function ComposerEmojiPickerDock({ show, theme, dockRef, onEmojiPick }: Pick<ComposerEmojiPickerProps, "theme" | "dockRef" | "onEmojiPick"> & { show: boolean }) {
  const strings = useStrings();
  const copy = strings.attachments;
  const composerCopy = strings.chats.composer;
  if (!show) return null;
  return <div className="emoji-picker-dock" ref={dockRef} role="group" aria-label={composerCopy.emojiPicker}><div className="emoji-picker emoji-picker--docked" role="menu" aria-label={copy.chooseEmoji}><Picker theme={theme} onEmojiPick={onEmojiPick} docked /></div></div>;
}
