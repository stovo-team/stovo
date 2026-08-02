import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const appNav = readFileSync(resolve(process.cwd(), "src/pages/AppNav.tsx"), "utf8");
const desktopNavigationStyles = styles.slice(
  styles.indexOf("/* Desktop conversation chrome"),
  styles.indexOf("/* Browser-only narrow layout")
);

describe("desktop app navigation active state", () => {
  it("centers one 56px circular highlight behind the navigation icon", () => {
    expect(desktopNavigationStyles).toContain("--app-nav-state-circle-size: 56px;");

    expect(desktopNavigationStyles).toContain(
      ".app-frame > .app-nav a:is(.active, :not(.active):hover)::before {\n    background: color-mix(in oklab, var(--stovo-primary) 10%, transparent);\n    border-radius: 50%;\n    content: \"\";\n    height: var(--app-nav-state-circle-size);\n    left: 50%;\n    pointer-events: none;\n    position: absolute;\n    top: -2px;\n    transform: translateX(-50%);\n    width: var(--app-nav-state-circle-size);"
    );
  });

  it("uses rounded outline icons for Chats, Storage, and Plans", () => {
    expect(appNav).toContain('import { CalendarDays, Folder, MessageCircle } from "lucide-react";');
    expect(appNav).toContain("<MessageCircle aria-hidden={true} />");
    expect(appNav).toContain("<Folder aria-hidden={true} />");
    expect(appNav).toContain("<CalendarDays aria-hidden={true} />");
  });
});
