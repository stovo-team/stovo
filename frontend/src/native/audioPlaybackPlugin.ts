import { Capacitor, registerPlugin } from "@capacitor/core";

import {
  parseNativeAudioPlaybackState,
  type NativeAudioPlaybackState,
} from "../audioNativeBridge";
import type {
  AudioDescriptor,
  AudioPlaybackBackend,
  AudioPlaybackSnapshot,
  AudioPlaybackSource,
} from "../audioPlaybackSession";

export interface AudioPlaybackPluginLoadOptions {
  chatId: string;
  messageId: string;
  fileId: string;
  sourceUrl: string;
  token?: string;
  startPosition: number;
}

export type AudioPlaybackPluginState = NativeAudioPlaybackState;

export interface AudioPlaybackPluginNative {
  getState(): Promise<unknown>;
  load(options: AudioPlaybackPluginLoadOptions): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(options: { position: number }): Promise<void>;
  clear(): Promise<void>;
  setCallActive(options: { active: boolean }): Promise<void>;
  addListener(
    eventName: "stateChanged",
    listener: (state: unknown) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const AudioPlaybackPlugin =
  registerPlugin<AudioPlaybackPluginNative>("AudioPlaybackPlugin");

export function isNativeAudioPlaybackAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function getNativeAudioPlaybackState(
  minimumRevision = -1,
): Promise<NativeAudioPlaybackState | null> {
  if (!isNativeAudioPlaybackAvailable()) return null;
  try {
    return parseNativeAudioPlaybackState(
      await AudioPlaybackPlugin.getState(),
      minimumRevision,
    );
  } catch {
    return null;
  }
}

export async function addAudioPlaybackStateListener(
  onChange: (state: NativeAudioPlaybackState) => void,
  minimumRevision = -1,
): Promise<() => void> {
  if (!isNativeAudioPlaybackAvailable()) return () => undefined;
  let acceptedRevision = minimumRevision;
  try {
    const handle = await AudioPlaybackPlugin.addListener(
      "stateChanged",
      (value: unknown) => {
        const state = parseNativeAudioPlaybackState(value, acceptedRevision);
        if (!state) return;
        acceptedRevision = state.revision;
        onChange(state);
      },
    );
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      void handle.remove().catch(() => undefined);
    };
  } catch {
    return () => undefined;
  }
}

function unavailableSnapshot(
  revision: number,
  platform: "android" | "unavailable",
): AudioPlaybackSnapshot {
  return Object.freeze({
    identity: null,
    title: "",
    position: 0,
    duration: 0,
    bufferedPosition: 0,
    status: "error",
    playWhenReady: false,
    isPlaying: false,
    suppressionReason: null,
    canSeek: false,
    error: "unavailable",
    revision,
    platform,
  });
}

function idleNativeSnapshot(revision: number): AudioPlaybackSnapshot {
  return Object.freeze({
    identity: null,
    title: "",
    position: 0,
    duration: 0,
    bufferedPosition: 0,
    status: "idle",
    playWhenReady: false,
    isPlaying: false,
    suppressionReason: null,
    canSeek: false,
    error: null,
    revision,
    platform: "android",
  });
}

function toPlaybackSnapshot(state: NativeAudioPlaybackState): AudioPlaybackSnapshot {
  const identity = state.identity ? Object.freeze({ ...state.identity }) : null;
  return Object.freeze({
    ...state,
    identity,
    title: "",
  });
}

export class NativeAudioPlaybackBackend implements AudioPlaybackBackend {
  private snapshot: AudioPlaybackSnapshot;
  private listeners = new Set<(snapshot: AudioPlaybackSnapshot) => void>();
  private listenerHandle: { remove: () => Promise<void> } | null = null;
  private acceptedRevision = -1;
  private connected = false;

  constructor(
    private readonly plugin: AudioPlaybackPluginNative = AudioPlaybackPlugin,
    private readonly isAvailable: () => boolean = isNativeAudioPlaybackAvailable,
  ) {
    this.snapshot = this.isAvailable()
      ? idleNativeSnapshot(0)
      : unavailableSnapshot(0, "unavailable");
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (!this.isAvailable()) {
      this.publishUnavailable("unavailable");
      return;
    }

    this.connected = true;
    try {
      this.listenerHandle = await this.plugin.addListener(
        "stateChanged",
        (value: unknown) => this.accept(value),
      );
    } catch {
      this.listenerHandle = null;
      this.connected = false;
      this.publishUnavailable("android");
    }

    try {
      this.accept(await this.plugin.getState());
    } catch {
      this.publishUnavailable("android");
    }
  }

  getSnapshot(): AudioPlaybackSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: AudioPlaybackSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(
    descriptor: AudioDescriptor,
    source: AudioPlaybackSource,
    position: number,
  ): Promise<void> {
    if (!this.isAvailable()) {
      this.publishUnavailable("unavailable");
      return;
    }
    // Natural end stops the service and resets its revision counter. Accept the
    // next load's snapshots even when they restart from a low revision.
    this.acceptedRevision = -1;
    await this.connect();
    if (!source.url?.trim() || !Number.isFinite(position)) {
      this.publishUnavailable("android");
      return;
    }
    try {
      await this.plugin.load({
        chatId: descriptor.identity.chatId,
        messageId: descriptor.identity.messageId,
        fileId: descriptor.identity.fileId,
        sourceUrl: source.url,
        token: source.token,
        startPosition: Math.max(0, position),
      });
    } catch {
      this.publishUnavailable("android");
    }
  }

  async play(): Promise<void> {
    await this.command(() => this.plugin.play());
  }

  async pause(): Promise<void> {
    await this.command(() => this.plugin.pause());
  }

  async seek(position: number): Promise<void> {
    if (!Number.isFinite(position)) return;
    const clamped = Math.max(
      0,
      this.snapshot.duration > 0
        ? Math.min(position, this.snapshot.duration)
        : position,
    );
    await this.command(() => this.plugin.seek({ position: clamped }));
  }

  async clear(): Promise<void> {
    if (this.isAvailable()) {
      try {
        await this.plugin.clear();
      } catch {
        // Cleanup is best effort; local listener authority is always released.
      }
    }
    await this.releaseListener();
    this.connected = false;
    this.acceptedRevision = -1;
    this.snapshot = this.isAvailable()
      ? idleNativeSnapshot(this.snapshot.revision + 1)
      : unavailableSnapshot(this.snapshot.revision + 1, "unavailable");
    this.emit();
  }

  async setCallActive(active: boolean): Promise<void> {
    await this.command(() => this.plugin.setCallActive({ active }));
  }

  private async command(command: () => Promise<void>): Promise<void> {
    if (!this.isAvailable()) {
      this.publishUnavailable("unavailable");
      return;
    }
    await this.connect();
    try {
      await command();
    } catch {
      this.publishUnavailable("android");
    }
  }

  private accept(value: unknown): void {
    const state = parseNativeAudioPlaybackState(value, this.acceptedRevision);
    if (!state) return;
    this.acceptedRevision = state.revision;
    this.snapshot = toPlaybackSnapshot(state);
    this.emit();
  }

  private publishUnavailable(platform: "android" | "unavailable"): void {
    this.snapshot = unavailableSnapshot(this.snapshot.revision + 1, platform);
    this.emit();
  }

  private async releaseListener(): Promise<void> {
    const handle = this.listenerHandle;
    this.listenerHandle = null;
    if (!handle) return;
    try {
      await handle.remove();
    } catch {
      // Idempotent teardown never exposes native failure text.
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}
