import { readCssSource } from "../test/cssSource";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));
const appNav = readFileSync(resolve(process.cwd(), "src/pages/AppNav.tsx"), "utf8");
const desktopNavigationStyles = styles.slice(
  styles.indexOf("/* Desktop conversation chrome"),
  styles.indexOf("/* Browser-only narrow layout")
);

describe("desktop app navigation active state", () => {
  it("centers one 60px circular highlight behind the navigation icon", () => {
    expect(desktopNavigationStyles).toContain("--app-nav-state-circle-size: 60px;");
    expect(styles).toContain("--nav-rail-width: 76px;");
    expect(desktopNavigationStyles).toContain("padding: 6px 4px;");

    expect(desktopNavigationStyles).toContain(
      ".app-frame > .app-nav a:is(.active, :not(.active):hover)::before,"
    );
    expect(desktopNavigationStyles).toContain("top: 50%;");
    expect(desktopNavigationStyles).toContain("transform: translate(-50%, -50%);");
    expect(styles).toContain("  gap: 3px;");
    expect(styles).toContain("    padding: 5px 1px;");
  });

  it("uses rounded outline Lucide icons for all nav destinations", () => {
    expect(appNav).toContain(
      'import { CalendarDays, Folder, LogOut, MessageCircle, Settings, ShieldCheck } from "lucide-react";'
    );
    expect(appNav).toContain("<MessageCircle aria-hidden={true} />");
    expect(appNav).toContain("<Folder aria-hidden={true} />");
    expect(appNav).toContain("<CalendarDays aria-hidden={true} />");
    expect(appNav).toContain("<Settings aria-hidden={true} />");
    expect(appNav).toContain("<ShieldCheck aria-hidden={true} />");
    expect(appNav).not.toContain("ms-icon");
  });
});
