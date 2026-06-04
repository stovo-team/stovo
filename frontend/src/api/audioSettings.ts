import { apiRequest } from "./client";
import { CallSettings } from "../realtime/CallController";

export type PersistedAudioSettings = Omit<CallSettings, "micMuted" | "soundDisabled">;

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

export function toPersistedSettings(settings: CallSettings): PersistedAudioSettings {
  const { micMuted: _mic, soundDisabled: _sound, ...rest } = settings;
  return rest;
}

export function mergeWithDefaults(partial: Partial<PersistedAudioSettings>): Partial<PersistedAudioSettings> {
  return partial;
}
