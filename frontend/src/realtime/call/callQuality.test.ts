import { describe, expect, it, vi } from "vitest";
import {
  applySenderMaxBitrate,
  bitrateKbpsToBps,
  callQualityProfileForChatType,
  resolveGuestMeetingQualityBitrates,
  resolveCallQualityBitrates,
  videoTrackPublishOptions,
} from "./callQuality";

describe("callQualityProfileForChatType", () => {
  it.each([["direct", "direct"], ["group", "group"], ["voice", "group"], [undefined, "group"]] as const)(
    "selects %s chat quality as %s",
    (chatType, profile) => expect(callQualityProfileForChatType(chatType)).toBe(profile),
  );
});

describe("resolveCallQualityBitrates", () => {
  const settings = {
    cameraBitrateKbps: 1_200,
    screenShareBitrateKbps: 4_000,
    groupCallCameraBitrateKbps: 2_000,
    groupCallScreenShareBitrateKbps: 6_000,
    dmCallCameraBitrateKbps: 1_900,
    dmCallScreenShareBitrateKbps: 3_500,
  };

  it("selects group-call camera and screen-share policies independently of guest and DM values", () => {
    expect(resolveCallQualityBitrates(settings, "group")).toEqual({
      cameraBitrateKbps: 2_000,
      screenShareBitrateKbps: 6_000,
    });
  });

  it("selects direct-message camera and screen-share policies independently of guest and group values", () => {
    expect(resolveCallQualityBitrates(settings, "direct")).toEqual({
      cameraBitrateKbps: 1_900,
      screenShareBitrateKbps: 3_500,
    });
  });

  it("falls back each missing or malformed setting independently", () => {
    expect(resolveCallQualityBitrates({
      groupCallCameraBitrateKbps: 2_500,
      groupCallScreenShareBitrateKbps: Number.NaN,
      dmCallCameraBitrateKbps: 0,
      dmCallScreenShareBitrateKbps: 7_000,
    }, "group")).toEqual({
      cameraBitrateKbps: 2_500,
      screenShareBitrateKbps: 5_000,
    });

    expect(resolveCallQualityBitrates({
      dmCallCameraBitrateKbps: -1,
      dmCallScreenShareBitrateKbps: 8_000,
    }, "direct")).toEqual({
      cameraBitrateKbps: 1_500,
      screenShareBitrateKbps: 8_000,
    });
  });

  it("uses safe defaults when settings are unavailable", () => {
    expect(resolveCallQualityBitrates(undefined, "group")).toEqual({
      cameraBitrateKbps: 1_500,
      screenShareBitrateKbps: 5_000,
    });
    expect(resolveCallQualityBitrates(null, "direct")).toEqual({
      cameraBitrateKbps: 1_500,
      screenShareBitrateKbps: 5_000,
    });
  });
});

describe("resolveGuestMeetingQualityBitrates", () => {
  it("selects guest camera and screen-share policies independently of group and DM values", () => {
    expect(resolveGuestMeetingQualityBitrates({
      cameraBitrateKbps: 1_100,
      screenShareBitrateKbps: 6_100,
      groupCallCameraBitrateKbps: 2_000,
      groupCallScreenShareBitrateKbps: 7_000,
      dmCallCameraBitrateKbps: 3_000,
      dmCallScreenShareBitrateKbps: 8_000,
    })).toEqual({
      cameraBitrateKbps: 1_100,
      screenShareBitrateKbps: 6_100,
    });
  });

  it("defaults missing or invalid guest camera and screen-share values independently", () => {
    expect(resolveGuestMeetingQualityBitrates({
      cameraBitrateKbps: 1_700,
    })).toEqual({
      cameraBitrateKbps: 1_700,
      screenShareBitrateKbps: 5_000,
    });

    expect(resolveGuestMeetingQualityBitrates({
      cameraBitrateKbps: Number.NaN,
      screenShareBitrateKbps: 9_000,
    })).toEqual({
      cameraBitrateKbps: 1_500,
      screenShareBitrateKbps: 9_000,
    });
  });
});

describe("bitrateKbpsToBps", () => {
  it.each([
    [1, 1_000],
    [1_500, 1_500_000],
    [20_000, 20_000_000],
  ])("converts %i kbps to %i bps", (kbps, bps) => {
    expect(bitrateKbpsToBps(kbps)).toBe(bps);
  });
});

describe("videoTrackPublishOptions", () => {
  it("returns a LiveKit camera encoding with the configured bitrate in bps", () => {
    expect(videoTrackPublishOptions(1_800, "camera")).toEqual({
      videoEncoding: { maxBitrate: 1_800_000 },
    });
  });

  it("returns a LiveKit screen-share encoding with bitrate and frame-rate caps", () => {
    expect(videoTrackPublishOptions(5_000, "screenShare")).toEqual({
      screenShareEncoding: { maxBitrate: 5_000_000, maxFramerate: 30 },
    });
  });
});

describe("applySenderMaxBitrate", () => {
  const makeSender = () => {
    const parameters = { encodings: [{}] } as RTCRtpSendParameters;
    return {
      parameters,
      sender: {
        getParameters: vi.fn(() => parameters),
        setParameters: vi.fn(async () => undefined),
      } as unknown as RTCRtpSender,
    };
  };

  it("sets the first sender encoding's maximum bitrate in bits per second", async () => {
    const { sender, parameters } = makeSender();

    await applySenderMaxBitrate(sender, 2_400);

    expect(parameters.encodings[0].maxBitrate).toBe(2_400_000);
    expect(sender.setParameters).toHaveBeenCalledWith(parameters);
  });

  it("applies the same cap to replacement senders when tracks are republished", async () => {
    const original = makeSender();
    const replacement = makeSender();

    await applySenderMaxBitrate(original.sender, 1_800);
    await applySenderMaxBitrate(replacement.sender, 1_800);

    expect(original.parameters.encodings[0].maxBitrate).toBe(1_800_000);
    expect(replacement.parameters.encodings[0].maxBitrate).toBe(1_800_000);
    expect(replacement.sender.setParameters).toHaveBeenCalledOnce();
  });

  it("does nothing when sender parameters have no encoding to constrain", async () => {
    const sender = {
      getParameters: vi.fn(() => ({ encodings: [] })),
      setParameters: vi.fn(async () => undefined),
    } as unknown as RTCRtpSender;

    await expect(applySenderMaxBitrate(sender, 1_500)).resolves.toBeUndefined();
    expect(sender.setParameters).not.toHaveBeenCalled();
  });

  it("does nothing when sender parameter APIs are unavailable", async () => {
    const sender = {} as RTCRtpSender;

    await expect(applySenderMaxBitrate(sender, 1_500)).resolves.toBeUndefined();
  });
});
