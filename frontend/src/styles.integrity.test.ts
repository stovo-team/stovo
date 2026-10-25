import { readCssSource } from "./test/cssSource";
import { parse } from "postcss";
import { expect, it } from "vitest";

it("parses global styles and keeps independent call, settings and storage rules at the root", () => {
  const css = readCssSource("src/styles.css");
  const root = parse(css);
  for (const selector of [
    ".meeting-intel-toggle-btn > svg.lucide-circle",
    ':root:is([data-theme-mode="dark"], [data-theme-mode="amoled"]) .settings-page input[type="time"]::-webkit-calendar-picker-indicator',
    ".storage-page:has(.storage-collection-full-page) .storage-source-collapse",
    ".voice-grid--9 > .voice-participant-card:last-child:nth-child(3n + 2)",
    ".storage-page .storage-preview-media:has(.document-preview-card--inline)",
    ".chat-info-member-row .avatar",
    ".call-popup.call-popup-group-call > .shared-call-stage",
    ".messenger-shell.has-active-chat .pinned-banner",
    ".guest-device-menu-trigger:focus-visible",
    ".app-frame > .app-nav .app-nav-logout:is(:hover, :focus-visible)::before",
    ".app-frame .logout-row:is(:hover, :focus-visible)",
  ]) {
    expect(root.nodes.some(node => node.type === "rule" && node.selector.includes(selector))).toBe(true);
  }
});
