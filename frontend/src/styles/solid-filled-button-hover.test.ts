import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sharedStyles = readFileSync("src/styles/solid-filled-button-hover.css", "utf8");
const callStyles = readFileSync("src/styles/call-popup.css", "utf8");
const voiceStyles = readFileSync("src/styles/voice-channels.css", "utf8");

describe("solid accent button hover colors", () => {
  it("keeps the incoming-call accept color stable", () => {
    expect(callStyles).toMatch(/\.call-ctrl-btn\.accept-btn\s*\{[^}]*background:\s*var\(--color-palette-3c5c1ab6c5fd\);/s);
    expect(callStyles).toMatch(/\.call-ctrl-btn\.accept-btn:hover\s*\{[^}]*background:\s*var\(--color-palette-3c5c1ab6c5fd\);/s);
  });

  it("keeps the voice channel join color stable while retaining its movement affordance", () => {
    expect(voiceStyles).toMatch(/\.voice-room-primary-join-btn\s*\{[^}]*background:\s*var\(--color-palette-8b8f7c3d4541\);/s);
    expect(voiceStyles).toMatch(/\.voice-room-primary-join-btn:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--color-palette-8b8f7c3d4541\);[^}]*transform:\s*translateY\(-1px\);/s);
  });

  it("does not apply solid accent hover styling to neutral call controls", () => {
    expect(sharedStyles).toContain(".call-popup-header-invite.is-active:hover:not(:disabled)");
    expect(sharedStyles).not.toContain(".shared-call-controls .call-ctrl-btn.is-active:hover");
    expect(sharedStyles).not.toContain(".mobile-active-ctrl-btn.active:hover");
  });

  it("applies the brand gradient to filled buttons and their hover states when the gradient theme is selected", () => {
    expect(sharedStyles).toMatch(/:root\[data-brand-gradient="custom"\]\s+\.popup-button--primary[\s\S]*?background:\s*var\(--color-brand-gradient\)/);
    expect(sharedStyles).toMatch(/:root\[data-brand-gradient="custom"\]\s+\.primary-button[\s\S]*?background:\s*var\(--color-brand-gradient\)/);
    expect(sharedStyles).toMatch(/:root\[data-brand-gradient="custom"\]\s+\.btn-primary[\s\S]*?background:\s*var\(--color-brand-gradient\)/);
    expect(sharedStyles).toMatch(/:root\[data-brand-gradient="custom"\]\s+\.plans-create-fab:hover:not\(:disabled\)[\s\S]*?background:\s*var\(--color-brand-gradient\)/);
    expect(sharedStyles).toMatch(/:root\[data-brand-gradient="custom"\]\s+\.popup-button--primary:hover:not\(:disabled\)[\s\S]*?background:\s*var\(--color-brand-gradient\)/);
  });
});
