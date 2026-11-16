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
  it("centers one 56px circular highlight behind the icon and label", () => {
    expect(desktopNavigationStyles).toContain("--app-nav-state-circle-size: 56px;");
    expect(styles).toContain("--nav-rail-width: 70px;");
    expect(desktopNavigationStyles).toContain("padding: 6px;");

    expect(desktopNavigationStyles).toContain(
      ".app-frame > .app-nav a.active::before {"
    );
    expect(desktopNavigationStyles).toContain("top: 50%;");
    expect(desktopNavigationStyles).toContain("transform: translate(-50%, -50%);");
    expect(styles).toContain("  gap: 3px;");
    expect(styles).toContain("    padding: 5px;");
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

describe("native app navigation active state", () => {
  it("keeps the active icon above its highlight at any WebView width", () => {
    expect(styles).toMatch(
      /:root\[data-platform="native"\][^{]*\.app-nav[^{}]*a\.active svg\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*1;/s
    );
  });
});

describe("mobile bottom nav active state", () => {
  it("matches desktop left-nav orange partially transparent background and bigger circle radius", () => {
    expect(styles).not.toMatch(
      /\.app-frame\s*>\s*\.app-nav\.app-nav--active-variant-a a\.active::before\s*\{[^}]*background:\s*var\(--color-brand-gradient\)/s
    );
    expect(styles).toMatch(
      /\.app-frame\s*>\s*\.app-nav\.app-nav--active-variant-a a\.active::before[^}]*background:\s*color-mix\(in oklab,\s*var\(--stovo-primary\)\s*24%,\s*transparent\)/s
    );
    expect(styles).not.toMatch(
      /\.app-frame\s*>\s*\.app-nav\.app-nav--active-variant-a a\.active::before[^}]*height:\s*44px/s
    );
    expect(styles).toMatch(
      /\.app-frame\s*>\s*\.app-nav\.app-nav--active-variant-a a\.active::before[^}]*border-radius:\s*var\(--radius-circle\)/s
    );
    expect(styles).toMatch(
      /\.app-frame\s*>\s*\.app-nav\.app-nav--active-variant-a a\.active::before[^}]*height:\s*var\(--app-nav-state-circle-size/s
    );
    expect(styles).toMatch(
      /\.app-frame\s*>\s*\.app-nav\.app-nav--active-variant-a a\.active::before[^}]*width:\s*var\(--app-nav-state-circle-size/s
    );
    expect(styles).not.toMatch(
      /\.app-frame\s*>\s*\.app-nav\.app-nav--active-variant-a a\.active\s*>\s*span:not\(\.ms-icon\)\s*\{[^}]*color:\s*var\(--color-palette-f2074b6cef37\)/s
    );
    expect(styles).toMatch(
      /\.app-frame\s*>\s*\.app-nav\.app-nav--active-variant-a a\.active\s*>\s*span:not\(\.ms-icon\)[^}]*color:\s*var\(--stovo-primary\)/s
    );
  });
});

