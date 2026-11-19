import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { strings } from "../../config/strings";
import { LanguageSettings } from "./LanguageSettings";
import { PrivacySecuritySettings } from "./PrivacySecuritySettings";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("settings choice controls", () => {
  it("shows each language as a selectable checkbox", async () => {
    const node = document.createElement("div"); const root = createRoot(node); const onChange = vi.fn();
    await act(async () => root.render(<LanguageSettings strings={strings} language="system" systemLanguage="en" onChange={onChange} />));
    const inputs = node.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(inputs).toHaveLength(3); expect(inputs[0].checked).toBe(true); expect(inputs[1].checked).toBe(false);
    await act(async () => inputs[1].click()); expect(onChange).toHaveBeenCalledWith("en");
    await act(async () => root.unmount());
  });

  it("shows privacy choices as selectable checkboxes", async () => {
    const node = document.createElement("div"); const root = createRoot(node); const onUpdatePrivacy = vi.fn();
    await act(async () => root.render(<PrivacySecuritySettings strings={strings} authRequest={{} as never} currentUser={{ profileVisibility: "family" } as never} members={[]} blockedMemberIds={[]} detail="profile" isSaving={false} appLockEnabled={false} canUseAppLock={false} onDetailChange={vi.fn()} onUpdatePrivacy={onUpdatePrivacy} onAppLockChange={vi.fn()} onToggleBlock={vi.fn()} renderMemberAvatar={() => null} />));
    const inputs = node.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(inputs).toHaveLength(2); expect(inputs[0].checked).toBe(true);
    await act(async () => inputs[1].click()); expect(onUpdatePrivacy).toHaveBeenCalledWith({ profileVisibility: "nobody" });
    await act(async () => root.unmount());
  });
});
