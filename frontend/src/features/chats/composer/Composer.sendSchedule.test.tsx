import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SendSubmenu } from "./SendSubmenu";
import { ScheduleMessageModal } from "./ScheduleMessageModal";
import { ReminderModal } from "./ReminderModal";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
});

describe("SendSubmenu", () => {
  it("renders when isOpen is true and fires schedule / reminder callbacks", () => {
    const onSelectSchedule = vi.fn();
    const onSelectReminder = vi.fn();
    const onClose = vi.fn();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <SendSubmenu
          isOpen={true}
          onClose={onClose}
          onSelectSchedule={onSelectSchedule}
          onSelectReminder={onSelectReminder}
        />
      );
    });

    const items = container.querySelectorAll("button[role='menuitem']");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Schedule message");
    expect(items[1].textContent).toContain("Set reminder");

    act(() => {
      items[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelectSchedule).toHaveBeenCalledTimes(1);

    act(() => {
      items[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelectReminder).toHaveBeenCalledTimes(1);
  });
});

describe("ScheduleMessageModal", () => {
  it("renders schedule modal with presets and submits selected future date", () => {
    const onConfirmSchedule = vi.fn();
    const onClose = vi.fn();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <ScheduleMessageModal
          isOpen={true}
          messageText="Hello future!"
          attachments={[]}
          onClose={onClose}
          onConfirmSchedule={onConfirmSchedule}
        />
      );
    });

    expect(document.body.textContent).toContain("Schedule Message");
    expect(document.body.querySelector(".schedule-preview-box")).toBeNull();

    // Check presets
    const presetButtons = document.body.querySelectorAll(".schedule-preset-chip");
    expect(presetButtons.length).toBeGreaterThanOrEqual(4);

    // Click confirm button
    const confirmBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Schedule Message"
    );
    expect(confirmBtn).toBeDefined();
    act(() => {
      confirmBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onConfirmSchedule).toHaveBeenCalledTimes(1);
    expect(onConfirmSchedule.mock.calls[0][0]).toBeInstanceOf(Date);
  });
});

describe("ReminderModal", () => {
  it("allows selecting frequency, custom days, repeat count, and submits rule", () => {
    const onConfirmReminder = vi.fn();
    const onClose = vi.fn();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <ReminderModal
          isOpen={true}
          messageText="Don't forget the keys"
          attachments={[]}
          onClose={onClose}
          onConfirmReminder={onConfirmReminder}
        />
      );
    });

    expect(document.body.textContent).toContain("Set Repeating Reminder");
    expect(document.body.textContent).toContain("Don't forget the keys");

    // Switch to Weekly frequency
    const weeklyTab = Array.from(document.body.querySelectorAll(".reminder-freq-tab")).find(
      (el) => el.textContent?.trim() === "Weekly"
    );
    expect(weeklyTab).toBeDefined();
    act(() => {
      weeklyTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Custom days of week should now be visible
    const dayChips = document.body.querySelectorAll(".reminder-day-chip");
    expect(dayChips.length).toBe(7); // Mon..Sun

    // Pick 10 times preset
    const repeatPreset = document.body.querySelector<HTMLSelectElement>(".preset-number-control__preset");
    act(() => {
      if (repeatPreset) repeatPreset.value = "10";
      repeatPreset?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Click Set Reminder button
    const confirmBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Set Reminder"
    );
    expect(confirmBtn).toBeDefined();
    act(() => {
      confirmBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onConfirmReminder).toHaveBeenCalledTimes(1);
    const rule = onConfirmReminder.mock.calls[0][0];
    expect(rule.frequency).toBe("weekly");
    expect(rule.repeatCount).toBe(10);
    expect(rule.remainingCount).toBe(10);
    expect(rule.daysOfWeek).toBeDefined();
  });
});
