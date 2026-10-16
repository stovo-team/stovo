import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("call and meeting popup shared composition", () => {
  it.each([
    "src/features/chats/calling/CallAudioSettingsPopup.tsx",
    "src/features/chats/calling/CallVideoSettingsPopup.tsx",
    "src/features/chats/calling/CallSettingsDialog.tsx",
    "src/features/chats/calling/CallSpeakerSheet.tsx",
  ])("uses the shared backdrop contract in %s", (path) => {
    expect(source(path)).toMatch(/PopupBackdrop|PopupDialog/);
  });

  it.each([
    "src/features/chats/calling/CallAudioSettingsPopup.tsx",
    "src/features/chats/calling/CallVideoSettingsPopup.tsx",
    "src/features/chats/calling/CallSettingsDialog.tsx",
    "src/features/chats/calling/TranscriptPanel.tsx",
  ])("uses the shared close control in %s", (path) => {
    expect(source(path)).toContain("PopupCloseButton");
  });

  it.each([
    "src/features/chats/calling/GroupCallPreJoinModal.tsx",
    "src/features/chats/calling/DesktopCallControls.tsx",
    "src/features/chats/ChatOverlays.tsx",
    "src/pages/GuestMeetingPage.tsx",
  ])("uses the shared dialog shell in %s", (path) => {
    expect(source(path)).toContain("PopupDialog");
  });

  it.each([
    "src/features/chats/calling/GroupCallPreJoinModal.tsx",
    "src/features/chats/calling/DesktopCallControls.tsx",
    "src/pages/GuestMeetingPage.tsx",
  ])("uses shared action buttons in %s", (path) => {
    expect(source(path)).toContain("PopupButton");
  });

  it("consolidates custom dropdowns on PopupSelect", () => {
    expect(source("src/features/chats/calling/GuestMeetingSelect.tsx")).toContain("PopupSelect");
    expect(source("src/features/chats/calling/CallDeviceSelect.tsx")).toContain("PopupSelect");
  });

  it("removes pointer triangle pseudo-elements from guest device dropdowns", () => {
    const styles = source("src/styles.css");
    expect(styles).not.toMatch(/\.guest-device-menu::before/);
  });
});
