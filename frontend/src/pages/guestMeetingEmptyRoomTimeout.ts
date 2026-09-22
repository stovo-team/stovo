export const EMPTY_GUEST_ROOM_TIMEOUT_MS = 5 * 60 * 1000;
export const EMPTY_GUEST_ROOM_WARNING_MS = 60 * 1000;

type EmptyRoomTimeoutOptions = {
  onWarning: () => void;
  onTimeout: () => void;
  timeoutMs?: number;
  warningMs?: number;
};

/**
 * Runs the guest-room timeout only while the local participant is alone.
 * A confirmation intentionally starts a completely new timeout window.
 */
export class EmptyGuestRoomTimeout {
  private warningTimer: number | null = null;
  private timeoutTimer: number | null = null;
  private alone = false;
  private readonly timeoutMs: number;
  private readonly warningMs: number;

  constructor(private readonly options: EmptyRoomTimeoutOptions) {
    this.timeoutMs = options.timeoutMs ?? EMPTY_GUEST_ROOM_TIMEOUT_MS;
    this.warningMs = options.warningMs ?? EMPTY_GUEST_ROOM_WARNING_MS;
  }

  setAlone(alone: boolean) {
    if (this.alone === alone) return;
    this.alone = alone;
    if (alone) this.schedule(); else this.clear();
  }

  stay() {
    if (!this.alone) return;
    this.clear();
    this.schedule();
  }

  dispose() {
    this.alone = false;
    this.clear();
  }

  private schedule() {
    const warningDelay = Math.max(0, this.timeoutMs - this.warningMs);
    this.warningTimer = window.setTimeout(() => {
      this.warningTimer = null;
      if (this.alone) this.options.onWarning();
    }, warningDelay);
    this.timeoutTimer = window.setTimeout(() => {
      this.timeoutTimer = null;
      if (this.alone) this.options.onTimeout();
    }, this.timeoutMs);
  }

  private clear() {
    if (this.warningTimer !== null) window.clearTimeout(this.warningTimer);
    if (this.timeoutTimer !== null) window.clearTimeout(this.timeoutTimer);
    this.warningTimer = null;
    this.timeoutTimer = null;
  }
}
