export type CallQualityProfile = "group" | "direct";

export function callQualityProfileForChatType(chatType: string | null | undefined): CallQualityProfile {
  return chatType === "direct" ? "direct" : "group";
}
export type CallVideoKind = "camera" | "screenShare";

export type CallQualitySettingsSource = {
  cameraBitrateKbps?: number | null;
  screenShareBitrateKbps?: number | null;
  groupCallCameraBitrateKbps?: number | null;
  groupCallScreenShareBitrateKbps?: number | null;
  dmCallCameraBitrateKbps?: number | null;
  dmCallScreenShareBitrateKbps?: number | null;
};

export type CallQualityBitrates = {
  cameraBitrateKbps: number;
  screenShareBitrateKbps: number;
};

export const DEFAULT_CALL_QUALITY_BITRATES: CallQualityBitrates = {
  cameraBitrateKbps: 1_500,
  screenShareBitrateKbps: 5_000,
};

function validBitrateOrDefault(value: number | null | undefined, fallback: number) {
  return Number.isInteger(value) && value! >= 1_000 && value! <= 20_000 ? value! : fallback;
}

export function resolveCallQualityBitrates(
  settings: CallQualitySettingsSource | null | undefined,
  callType: CallQualityProfile,
): CallQualityBitrates {
  if (callType === "direct") {
    return {
      cameraBitrateKbps: validBitrateOrDefault(settings?.dmCallCameraBitrateKbps, DEFAULT_CALL_QUALITY_BITRATES.cameraBitrateKbps),
      screenShareBitrateKbps: validBitrateOrDefault(settings?.dmCallScreenShareBitrateKbps, DEFAULT_CALL_QUALITY_BITRATES.screenShareBitrateKbps),
    };
  }
  return {
    cameraBitrateKbps: validBitrateOrDefault(settings?.groupCallCameraBitrateKbps, DEFAULT_CALL_QUALITY_BITRATES.cameraBitrateKbps),
    screenShareBitrateKbps: validBitrateOrDefault(settings?.groupCallScreenShareBitrateKbps, DEFAULT_CALL_QUALITY_BITRATES.screenShareBitrateKbps),
  };
}

export function resolveGuestMeetingQualityBitrates(
  settings: CallQualitySettingsSource | null | undefined,
): CallQualityBitrates {
  return {
    cameraBitrateKbps: validBitrateOrDefault(settings?.cameraBitrateKbps, DEFAULT_CALL_QUALITY_BITRATES.cameraBitrateKbps),
    screenShareBitrateKbps: validBitrateOrDefault(settings?.screenShareBitrateKbps, DEFAULT_CALL_QUALITY_BITRATES.screenShareBitrateKbps),
  };
}

export function bitrateKbpsToBps(kbps: number): number {
  return Math.round(kbps * 1_000);
}

export function videoTrackPublishOptions(bitrateKbps: number, mediaKind: CallVideoKind) {
  const maxBitrate = bitrateKbpsToBps(bitrateKbps);
  return mediaKind === "camera"
    ? { videoEncoding: { maxBitrate } }
    : { screenShareEncoding: { maxBitrate, maxFramerate: 30 } };
}

export async function applySenderMaxBitrate(sender: RTCRtpSender, bitrateKbps: number): Promise<void> {
  try {
    if (typeof sender.getParameters !== "function" || typeof sender.setParameters !== "function") return;
    const parameters = sender.getParameters();
    const encoding = parameters.encodings?.[0];
    if (!encoding) return;
    encoding.maxBitrate = bitrateKbpsToBps(bitrateKbps);
    await sender.setParameters(parameters);
  } catch {
    // The browser may reject bitrate updates on some codecs or device tracks.
  }
}
