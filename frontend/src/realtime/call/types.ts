export type CallTopology = "mesh" | "sfu";

export type CallParticipantState =
  | "invited"
  | "ringing"
  | "connecting"
  | "connected"
  | "left"
  | "declined";

export type CallParticipantInfo = {
  userId: string;
  role: "host" | "member" | string;
  state: CallParticipantState | string;
  joinedAt?: string;
};

export type RemoteMedia = {
  userId: string;
  stream: MediaStream;
  screenStream: MediaStream | null;
  hasVideo: boolean;
  hasAudio: boolean;
  hasScreenShare: boolean;
  isMuted?: boolean;
};

export type CallSettings = {
  micMuted: boolean;
  soundDisabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  cameraFacingMode: "user" | "environment";
  speakerMode: "small" | "large";
  inputDeviceId: string;
  outputDeviceId: string;
  videoDeviceId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  voiceEnhancement: boolean;
  inputGain: number;
  speakingSensitivity: number;
  outputVolume: number;
  voiceEnhancementThreshold: number;
  voiceEnhancementHighpass: number;
  mirrorLocalVideo: boolean;
};

export type CallDevice = {
  deviceId: string;
  kind: "audioinput" | "audiooutput" | "videoinput";
  label: string;
};

export type CallCapabilities = {
  canSelectInputDevice: boolean;
  canSelectOutputDevice: boolean;
  canUseNoiseSuppression: boolean;
  canUseEchoCancellation: boolean;
  canUseAutoGainControl: boolean;
  canUseVoiceEnhancement: boolean;
  canUseCamera: boolean;
  canShareScreen: boolean;
};

export const DEFAULT_CALL_SETTINGS: CallSettings = {
  micMuted: false,
  soundDisabled: false,
  cameraEnabled: false,
  screenSharing: false,
  cameraFacingMode: "user",
  speakerMode: "small",
  inputDeviceId: "",
  outputDeviceId: "",
  videoDeviceId: "",
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  voiceEnhancement: true,
  inputGain: 100,
  speakingSensitivity: 8,
  outputVolume: 100,
  voiceEnhancementThreshold: -24,
  voiceEnhancementHighpass: 120,
  mirrorLocalVideo: true,
};

/** Deterministic mesh offerer: lower userId creates the offer to avoid glare. */
export function shouldOfferToPeer(localUserId: string, remoteUserId: string): boolean {
  return localUserId < remoteUserId;
}
