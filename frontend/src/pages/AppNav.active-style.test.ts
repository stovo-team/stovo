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
  it("fills the complete desktop link cell with a rounded rectangular highlight", () => {
    expect(desktopNavigationStyles).toContain(".app-frame > .app-nav a:is(.active, :not(.active):hover)::before");
    expect(desktopNavigationStyles).toContain("inset: 0;");
    expect(desktopNavigationStyles).toContain("border-radius: 12px;");
    expect(desktopNavigationStyles).not.toContain("--app-nav-state-circle-size");
    expect(desktopNavigationStyles).not.toContain(".app-nav .app-nav-logout:hover:not(:disabled)::before");
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

describe("navigation icon and touch states", () => {
  it("fills selected SVG navigation icons", () => {
    expect(styles).toContain(".app-frame > .app-nav a.active svg");
    expect(styles).toContain("fill: currentColor;");
  });

  it("does not apply hover appearance to nav links on touch devices", () => {
    expect(styles).toContain("@media (hover: none)");
    expect(styles).toContain(".app-frame > .app-nav a:hover");
    expect(styles).toContain("background: transparent !important;");
  });
});
