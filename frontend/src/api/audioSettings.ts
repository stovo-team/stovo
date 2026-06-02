import { apiRequest } from "./client";
import { CallAudioSettings, DEFAULT_CALL_AUDIO_SETTINGS } from "../realtime/AudioCallController";

export type PersistedAudioSettings = Omit<CallAudioSettings, "micMuted" | "soundDisabled">;

export function getAudioSettings(accessToken: string): Promise<PersistedAudioSettings> {
  return apiRequest<PersistedAudioSettings>("/api/auth/audio-settings", { accessToken });
}

export function saveAudioSettings(
  accessToken: string,
  settings: PersistedAudioSettings
): Promise<PersistedAudioSettings> {
  return apiRequest<PersistedAudioSettings>("/api/auth/audio-settings", {
    method: "PUT",
    accessToken,
    body: settings
  });
}

export function toPersistedSettings(settings: CallAudioSettings): PersistedAudioSettings {
  const { micMuted: _mic, soundDisabled: _sound, ...rest } = settings;
  return rest;
}

export function mergeWithDefaults(partial: Partial<PersistedAudioSettings>): CallAudioSettings {
  return { ...DEFAULT_CALL_AUDIO_SETTINGS, ...partial };
}
