import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CspSafeEmojiPicker from "./components/CspSafeEmojiPicker";

const picker = readFileSync("src/components/CspSafeEmojiPicker.tsx", "utf8");
const pickerConsumers = [
  "src/features/chats/composer/ComposerEmojiPicker.tsx",
  "src/components/AttachmentPickerSheet.tsx",
  "src/components/MessageEnlargeModal.tsx"
].map((path) => readFileSync(path, "utf8"));

describe("emoji picker image sources", () => {
  it("forces native emoji so the picker does not request remote sprite images", () => {
    expect(picker).toContain("emojiStyle={EmojiStyle.NATIVE}");
    for (const consumer of pickerConsumers) {
      expect(consumer).toContain("<CspSafeEmojiPicker");
      expect(consumer).not.toContain("<EmojiPicker");
    }

    const markup = renderToStaticMarkup(<CspSafeEmojiPicker onEmojiClick={() => undefined} />);
    expect(markup).toContain("😊");
    expect(markup).not.toMatch(/<img\b[^>]*src=["']https?:/i);
  });
});
