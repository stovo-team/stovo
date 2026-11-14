import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readTextFile } from "./testUtils/readTextFile";
import { readCssSource } from "./test/cssSource";

const appSource = readTextFile(resolve(process.cwd(), "src/App.tsx"));
const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

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

  it("does not stack mobile chat-list slide animation on top of the tab carousel when switching to chats", () => {
    expect(styles).toMatch(
      /\.app-route-layer--back \.messenger-shell\.chat-list-view \.chat-sidebar[\s\S]*?animation:\s*none;/
    );
    expect(styles).toMatch(
      /\.app-route-layer--back \.messenger-shell\.chat-list-view \.chat-detail[\s\S]*?animation:\s*none;/
    );
    expect(appSource).not.toMatch(
      /useEffect\(\(\)\s*=>\s*\{\s*if\s*\(chatRouteActive\)\s*\{\s*setHasVisitedChats\(true\);/
    );
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

  it("keeps minimized call UI outside the hidden chats route and minimizes calls on departure", () => {
    const callFeatureSource = readTextFile(resolve(process.cwd(), "src/features/chats/calling/CallFeature.tsx"));

    expect(callFeatureSource).toContain("createPortal");
    expect(callFeatureSource).toContain("useLocation");
    expect(callFeatureSource).toContain('const routeMinimized = callPhase !== "idle" && !isOnChatsRoute;');
    expect(callFeatureSource).toContain("<MinimizedCallBar");
    expect(callFeatureSource).toContain("visible={effectiveIsCallMinimized}");
    expect(styles).toContain(".minimized-call");
  });
});
