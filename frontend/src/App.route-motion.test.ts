import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("native tab transition layer", () => {
  it("animates page content smoothly with carousel transitions while keeping fixed navigation stable", () => {
    expect(appSource).toContain('const [motionFinishedForPath, setMotionFinishedForPath]');
    expect(appSource).toContain('motionFinishedForPath !== location.pathname');
    expect(appSource).toContain('onAnimationEnd={(event) => {');
    expect(appSource).toContain('if (event.target !== event.currentTarget) return;');
    expect(appSource).toContain('setMotionFinishedForPath(location.pathname);');
    expect(styles).toContain("animation-fill-mode: backwards;");
    expect(styles).toContain("will-change: opacity, transform;");
    expect(styles).toMatch(/@keyframes app-tab-carousel-forward\s*\{[^}]*transform:/);
    expect(styles).toMatch(/@keyframes app-tab-carousel-back\s*\{[^}]*transform:/);
  });
});

describe("call session route lifetime", () => {
  it("keeps the chats route mounted while another app tab is active", () => {
    expect(appSource).toContain("app-cached-chat-route");
    expect(appSource).toContain("hasVisitedChats");
    expect(appSource).toContain('display: chatRouteActive ? "contents" : "none"');
    expect(appSource).toContain("chatRouteActive");
    expect(appSource).toContain('<div key={location.pathname}>\n    <Routes location={location}>');
    expect(appSource).not.toContain('key={location.pathname}\n      className={`app-route-layer');
  });
});
