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

  it("uses circular icon controls and matching typography in the collapsed mobile Intelligence section", () => {
    expect(component).toContain('className="meeting-intel-inline-toggle"');
    expect(component).toContain('aria-expanded={isExpanded}');
    expect(component).toContain('{isExpanded && <div className="meeting-intel-content">');
    expect(component).toContain("isNotesActive ? <Square");
    expect(component).toContain("isRecActive ? <Square");
    expect(component).toContain("<Circle size={17}");
    const button = ruleFor(".meeting-intel-popover--inline-menu .meeting-intel-toggle-btn");
    expect(button).toMatch(/border-radius:\s*50%/);
    expect(button).toMatch(/min-width:\s*36px/);
    expect(button).toMatch(/flex:\s*0 0 36px/);
    expect(ruleFor(".meeting-intel-popover--inline-menu .meeting-intel-inline-toggle")).toMatch(/padding:\s*0 12px/);
    const titleRules = Array.from(styles.matchAll(/\.meeting-intel-popover--inline-menu \.meeting-intel-name\s*\{([^}]*)\}/g), (match) => match[1]);
    expect(titleRules.at(-1)).toMatch(/font-size:\s*\.875rem/);
  });

  it("keeps Live Captions disabled and places its Premium badge beside the switch", () => {
    const captionsCard = component.slice(component.indexOf("{/* Live Captions"));
    expect(captionsCard).toContain('aria-label="Live Captions unavailable"');
    expect(captionsCard).toContain("defaultChecked={false}");
    expect(captionsCard).toContain("disabled");
    expect(captionsCard).toContain('aria-disabled="true"');
    expect(ruleFor('.meeting-intel-card[aria-disabled="true"] .meeting-intel-card-title')).toMatch(/color:\s*var\(--text-muted\)/);
    expect(ruleFor('.meeting-intel-card[aria-disabled="true"] .meeting-intel-card-icon')).toMatch(/color:\s*var\(--text-muted\)/);
    expect(captionsCard.indexOf("meeting-intel-switch-slider")).toBeLessThan(captionsCard.indexOf('aria-label="Premium feature"'));
    expect(captionsCard).not.toContain("Caption translation");
    expect(captionsCard).not.toContain("meeting-intel-card-subbar");
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
