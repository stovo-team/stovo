import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const desktopCalls = readFileSync(resolve(process.cwd(), "src/features/chats/calling/DesktopCallControls.tsx"), "utf8");
const voiceCalls = readFileSync(resolve(process.cwd(), "src/features/chats/calling/VoiceChannelStage.tsx"), "utf8");
const sharedControls = readFileSync(resolve(process.cwd(), "src/features/chats/calling/CallDeviceControls.tsx"), "utf8");

describe("desktop call device controls", () => {
  it("uses the guest meeting split device controls for direct and group calls", () => {
    expect(desktopCalls).toContain("CallDeviceControls");
    expect(desktopCalls).toContain("call-ctrl-row call-popup-ctrl-row shared-call-controls guest-call-controls");
    expect(desktopCalls).toContain("showCamera={callPhase === \"in-call\"}");
    expect(desktopCalls).toContain("capabilities={callAudioCapabilities}");
  });

  it("uses the same split controls in voice channels while preserving the mobile-only controls", () => {
    expect(voiceCalls).toContain("CallDeviceControls");
    expect(voiceCalls).toContain("voice-room-in-call-controls guest-call-controls shared-call-controls");
    expect(voiceCalls).toContain("voice-mobile-only-control");
    expect(voiceCalls).toContain("capabilities={callAudioCapabilities}");
    expect(voiceCalls).toContain("labels={{ microphone: voiceStrings?.microphone, speaker: voiceStrings?.speaker, camera: voiceStrings?.camera }}");
    expect(voiceCalls).toContain("voiceStrings?.unmuteMic");
    expect(voiceCalls).toContain("voiceStrings?.turnOnCamera");
    expect(voiceCalls).toContain("deviceStrings={voiceStrings}");
    expect(sharedControls).toContain('deviceKind="audioinput"');
    expect(sharedControls).toContain('deviceKind="audiooutput"');
    expect(sharedControls).toContain('deviceKind="videoinput"');
    expect(sharedControls).toContain("onDeviceChange={(inputDeviceId) => onPatch({ inputDeviceId })}");
    expect(sharedControls).toContain("onDeviceChange={(outputDeviceId) => onPatch({ outputDeviceId })}");
    expect(sharedControls).toContain("onDeviceChange={(videoDeviceId) => onPatch({ videoDeviceId })}");
  });
});
