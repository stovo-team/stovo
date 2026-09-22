import { describe, expect, it, vi } from "vitest";
import { EmptyGuestRoomTimeout } from "./guestMeetingEmptyRoomTimeout";

describe("EmptyGuestRoomTimeout", () => {
  it("warns after four minutes and disconnects after five while the guest is alone", () => {
    vi.useFakeTimers();
    const onWarning = vi.fn();
    const onTimeout = vi.fn();
    const timeout = new EmptyGuestRoomTimeout({ onWarning, onTimeout });

    timeout.setAlone(true);
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(onWarning).toHaveBeenCalledOnce();
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60 * 1000);
    expect(onTimeout).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("cancels the countdown when another participant joins", () => {
    vi.useFakeTimers();
    const onWarning = vi.fn();
    const onTimeout = vi.fn();
    const timeout = new EmptyGuestRoomTimeout({ onWarning, onTimeout });

    timeout.setAlone(true);
    timeout.setAlone(false);
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(onWarning).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("starts a fresh five-minute window when the guest chooses to stay", () => {
    vi.useFakeTimers();
    const onWarning = vi.fn();
    const onTimeout = vi.fn();
    const timeout = new EmptyGuestRoomTimeout({ onWarning, onTimeout });

    timeout.setAlone(true);
    vi.advanceTimersByTime(4 * 60 * 1000);
    timeout.stay();
    vi.advanceTimersByTime(60 * 1000);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3 * 60 * 1000);
    expect(onWarning).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60 * 1000);
    expect(onTimeout).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
