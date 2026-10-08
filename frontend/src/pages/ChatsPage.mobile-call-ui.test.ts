import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mobileActiveSource = readFileSync(
  resolve(process.cwd(), "src/features/chats/calling/MobileActiveScreen.tsx"),
  "utf8",
);
const callFeatureSource = readFileSync(
  resolve(process.cwd(), "src/features/chats/calling/CallFeature.tsx"),
  "utf8",
);
const chatsPageSource = readFileSync(resolve(process.cwd(), "src/pages/ChatsPage.tsx"), "utf8");
const conversationPanelSource = readFileSync(
  resolve(process.cwd(), "src/features/chats/conversation/ConversationPanel.tsx"),
  "utf8",
);
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8")
  .replace(/^\uFEFF/, "")
  .replace(/\r\n/g, "\n");

describe("mobile active video call UI", () => {
  it("keeps the compact self-view in control-safe fixed corners", () => {
    expect(mobileActiveSource).toContain("const [isSelfViewFullscreen, setIsSelfViewFullscreen]");
    expect(mobileActiveSource).toContain("const [selfViewSide, setSelfViewSide]");
    expect(mobileActiveSource).toContain('areControlsVisible ? "top" : "bottom"');
    expect(styles).toContain(".mobile-active-pip");
    expect(styles).toContain("width: 104px");
    expect(styles).toContain(".mobile-active-pip--top");
    expect(styles).toContain(".mobile-active-pip--bottom");
    expect(styles).toContain(".mobile-active-pip--top.mobile-active-pip--right");
    expect(styles).toContain(".mobile-active-pip--bottom");
  });

  it("puts camera flip on the compact self-view instead of the control row", () => {
    expect(mobileActiveSource).toContain("mobile-active-pip-flip");
    expect(mobileActiveSource).toContain('label="Flip camera"');
    expect(mobileActiveSource).not.toContain("{/* Flip camera â€” only during video */}");
  });

  it("blacks out local preview before applying mirror during camera flip", () => {
    expect(mobileActiveSource).toContain("const [isCameraFlipping, setIsCameraFlipping]");
    expect(mobileActiveSource).toContain("const [previewFacingMode, setPreviewFacingMode]");
    expect(mobileActiveSource).toContain("Let the blackout paint before facingMode/mirror state updates");
    expect(mobileActiveSource).toContain("setPreviewFacingMode(nextFacing)");
    expect(mobileActiveSource).toContain("dst.srcObject = null");
    expect(styles).toContain(".mobile-active-pip {\n  position: absolute;\n  width: 104px;\n  height: 140px;\n  border: 2px solid rgba(255, 255, 255, 0.35);\n  border-radius: 8px;\n  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.42);\n  background: #000;");
  });

  it("hides only the lower controls after inactivity and lets a screen tap reveal them", () => {
    expect(mobileActiveSource).toContain("const [areControlsVisible, setAreControlsVisible]");
    expect(mobileActiveSource).toContain("CALL_CONTROLS_HIDE_DELAY_MS");
    expect(mobileActiveSource).toContain("onPointerDown={toggleControls}");
    expect(mobileActiveSource).toContain("mobile-active-controls--hidden");
    expect(styles).toContain(".mobile-active-controls--hidden");
  });

  it("does not show a generic video call title in the popup header", () => {
    expect(callFeatureSource).not.toContain('      ? "Video call"\n      : "Audio call"');
  });

  it("keeps a minimized voice channel in the shared portal surface", () => {
    expect(callFeatureSource).toContain('callPhase !== "idle" && !isVoiceChannel');
    expect(callFeatureSource).toContain("<MinimizedCallBar");
    expect(callFeatureSource).toContain("visible={effectiveIsCallMinimized}");
    expect(chatsPageSource).not.toContain("<MobileMinimizedCallBar");
    expect(conversationPanelSource).toContain('callSession?.setIsCallMinimized(true);');
    expect(conversationPanelSource).not.toContain('callSession?.setIsCallMinimized(true);\n          onBack();');
    expect(conversationPanelSource).toContain('const isShowingVoiceTextChat');
    expect(conversationPanelSource).toContain('selectedChat.type === "voice" && !isShowingVoiceTextChat');
    expect(conversationPanelSource).toContain('message.type !== "call"');
    expect(styles).toContain(".minimized-call");
  });

  it("uses compact spacing for the bottom app navigation", () => {
    expect(styles).toContain(".app-frame > .app-nav .app-nav-links {\n    display: flex;\n    flex: 1;\n    gap: 0;");
  });

  it("keeps app navigation fixed above the system bottom inset on every mobile section", () => {
    expect(styles).toContain(".app-frame:not(.has-active-chat) > .app-nav {\n    bottom: var(--nav-pill-inset-bottom);\n    display: flex;\n    position: fixed;\n    z-index: 100;");
    expect(styles).toContain(".plans-page .plans-layout,");
    expect(styles).toContain(".settings-page > .page-surface,");
    expect(styles).toContain(".admin-page > .page-surface,");
    expect(styles).toContain(":root[data-platform=\"native\"] .app-frame:not(.has-active-chat) > .app-nav {");
    expect(styles).toContain(
      "padding-bottom: calc(var(--nav-pill-height) + var(--nav-pill-inset-bottom) + 32px);",
    );
  });
});
