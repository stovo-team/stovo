import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("src/features/chats/calling/MeetingIntelligencePopover.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

function ruleFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "s"));
  return match?.[1] ?? "";
}

describe("meeting intelligence popover design", () => {
  it("removes the subtitle and card descriptions and tightens header-to-content spacing", () => {
    expect(component).not.toContain("meeting-intel-subtitle");
    expect(component).not.toContain("Meeting AI & Recording");
    expect(component).not.toContain("meeting-intel-card-desc");
    const popover = ruleFor(".meeting-intel-popover");
    expect(popover).toMatch(/gap:\s*(?:0|[1-4])px/);
    expect(ruleFor(".meeting-intel-header")).toMatch(/padding:\s*[^;]*(?:0|[1-4])px\s*;/);
  });

  it("uses borderless cards and the unwrapped Stovo Intelligence logo", () => {
    expect(component).not.toContain("meeting-intel-logo-wrap");
    const card = ruleFor(".meeting-intel-card");
    expect(card).not.toMatch(/border(?:-top|\s*):/);
    expect(ruleFor(".meeting-intel-card + .meeting-intel-card")).not.toMatch(/border/);
  });

  it("uses labeled rectangular controls and a collapsed Intelligence section in the mobile menu", () => {
    expect(component).toContain('className="meeting-intel-inline-toggle"');
    expect(component).toContain('aria-expanded={isExpanded}');
    expect(component).toContain('{isExpanded && <div className="meeting-intel-content">');
    expect(component).toContain('isNotesActive ? "Stop"');
    expect(component).toContain('isRecActive ? "Stop"');
    const button = ruleFor(".meeting-intel-popover--inline-menu .meeting-intel-toggle-btn");
    expect(button).toMatch(/border-radius:\s*9px/);
    expect(button).toMatch(/min-width:\s*58px/);
    expect(button).toMatch(/flex:\s*0 0 auto/);
  });

  it("keeps the blue Premium badge inside the Live Captions card", () => {
    const captionsCard = component.slice(component.indexOf("{/* Live captions"));
    expect(captionsCard.indexOf("aria-label=\"Premium feature\"")).toBeLessThan(captionsCard.indexOf("meeting-intel-card-subbar"));
    expect(ruleFor('.meeting-intel-restricted-badge[aria-label="Premium feature"]')).toMatch(/#bfdbfe/);
  });

  it("centers the AI Notes preparation toast in the viewport", () => {
    const toast = ruleFor(".meeting-intel-background-toast");
    expect(toast).toMatch(/position:\s*fixed/);
    expect(toast).toMatch(/top:\s*50%/);
    expect(toast).toMatch(/left:\s*50%/);
    expect(toast).toMatch(/transform:\s*translate\(-50%,\s*-50%\)/);
    expect(toast).toMatch(/bottom:\s*auto/);
  });
});
