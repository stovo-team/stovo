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

  it("uses circular start and square stop SVG controls for both AI Notes and recording", () => {
    expect(component).toMatch(/\bCircle\b/);
    expect(component).toMatch(/\bSquare\b/);
    expect(component.match(/<Circle\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(component.match(/<Square\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    const button = ruleFor(".meeting-intel-toggle-btn");
    expect(button).toMatch(/border-radius:\s*(?:50%|999px)/);
    expect(button).toMatch(/height:\s*\d+px/);
    expect(button).toMatch(/width:\s*\d+px/);
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
