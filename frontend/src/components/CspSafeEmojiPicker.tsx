import type { ComponentProps } from "react";
import EmojiPicker, { EmojiStyle } from "emoji-picker-react";

export { Theme } from "emoji-picker-react";
export type { EmojiClickData } from "emoji-picker-react";

export function CspSafeEmojiPicker(props: ComponentProps<typeof EmojiPicker>) {
  return <EmojiPicker {...props} emojiStyle={EmojiStyle.NATIVE} />;
}

export default CspSafeEmojiPicker;
