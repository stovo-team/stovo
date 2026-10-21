import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("uses the same outer aspect ratio for camera-on and camera-off voice cards", () => {
  const styles=readFileSync("src/styles.css","utf8");
  const selector=".shared-call-stage .voice-participant-card";
  const rules=[...styles.matchAll(/\.shared-call-stage \.voice-participant-card\s*\{([^}]+)\}/g)];
  expect(rules.some(rule=>rule[1].includes("aspect-ratio: 16 / 9;"))).toBe(true);
  expect(styles.includes(`${selector}.has-video,`)).toBe(false);
});

it("fits the two-row voice layout within the same stage height budget", () => {
  const styles=readFileSync("src/styles.css","utf8");
  const rule=styles.match(/\.shared-call-stage \.voice-room-grid\.voice-grid--2\s*\{([^}]+)\}/)?.[1];
  expect(rule).toContain("calc((100dvh - 232px) * 8 / 9)");
  expect(rule).toContain("aspect-ratio: auto;");
});

it("scopes vertical voice-row fitting to voice rooms, preserving two-column group-call galleries", () => {
  const styles=readFileSync("src/styles.css","utf8");
  const start=styles.indexOf("/* Fit whole voice rows");
  const end=styles.indexOf("/* Record actions", start);
  const fitting=styles.slice(styles.indexOf("\n", start) + 1, end);
  const selectors=[...fitting.matchAll(/^([^{}]+)\{/gm)].map(match=>match[1].trim());
  expect(selectors).toHaveLength(4);
  expect(selectors.every(selector=>selector.startsWith(".voice-channel-room "))).toBe(true);
});
