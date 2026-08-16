import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("native tab transition layer", () => {
  it("keeps the animated route layer untransformed so fixed navigation is immediate", () => {
    expect(appSource).toContain('const [motionFinishedForPath, setMotionFinishedForPath]');
    expect(appSource).toContain('motionFinishedForPath !== location.pathname');
    expect(appSource).toContain('onAnimationEnd={(event) => {');
    expect(appSource).toContain('setMotionFinishedForPath(location.pathname);');
    expect(styles).toContain("animation-fill-mode: backwards;");
    expect(styles).toContain("will-change: opacity;");
    expect(styles).not.toMatch(/@keyframes app-tab-carousel-(?:forward|back)\s*\{[^}]*transform:/);
  });
});
