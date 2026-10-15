import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const cssFiles = [
  "src/styles.css",
  "src/pages/MultiAdminPage.css",
  "src/pages/AdminServerSettingsPage.css",
  "src/features/chats/calling/floatingCallPanel.css",
];
const read = (path: string) => readFileSync(path, "utf8");
const sourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
});

describe("shared design tokens", () => {
  it("uses the configured control size for chat detail tabs and member invitation", () => {
    const styles = read("src/styles.css");
    const rule = (selector: string) => styles.match(new RegExp(`${selector}\\s*\\{([^}]+)\\}`))?.[1] ?? "";

    expect(rule("\\.chat-info-tab")).toContain("font-size: var(--font-size-button)");
    expect(rule("\\.chat-info-member-invite")).toContain("font-size: var(--font-size-button)");
  });

  it("routes discrete production font sizes through the shared scale", () => {
    const offenders = cssFiles.flatMap((path) => {
      const css = read(path);
      return [...css.matchAll(/font-size\s*:\s*([^;]+);/g)]
        .map((match) => match[1].trim())
        .filter((value) => !value.includes("var(--font-size-") && !/^(inherit|initial|unset|revert)$/.test(value));
    });

    expect(offenders).toEqual([]);
  });

  it("routes numeric production font weights through the shared scale", () => {
    const offenders = cssFiles.flatMap((path) => {
      const css = read(path);
      return [...css.matchAll(/font-weight\s*:\s*([^;]+);/g)]
        .map((match) => match[1].trim())
        .filter((value) => !value.startsWith("var(--font-weight-") && !/^(inherit|initial|unset|revert|normal|bold|bolder|lighter)$/.test(value));
    });

    expect(offenders).toEqual([]);
  });

  it("routes production font stacks through shared family tokens", () => {
    const offenders = cssFiles.flatMap((path) => {
      const css = read(path);
      return [...css.matchAll(/(?<![-\w])font-family\s*:\s*([^;]+);/g)]
        .map((match) => match[1].trim())
        .filter((value) => !value.startsWith("var(--font-family-") && !value.startsWith("var(--message-font-family") && !/^(inherit|initial|unset|revert|"Material Symbols Outlined")$/.test(value));
    });

    expect(offenders).toEqual([]);
  });

  it("routes production corner radii through the shared scale", () => {
    const radiusProperty = /(?:border-radius|border-(?:top|bottom)-(?:left|right)-radius)\s*:\s*([^;]+);/g;
    const offenders = cssFiles.flatMap((path) => {
      const css = read(path);
      return [...css.matchAll(radiusProperty)]
        .map((match) => match[1].trim())
        .filter((value) => !value.includes("var(--radius-") && !/^(?:0(?:px)?|inherit|initial|unset|revert)(?:\s*!important)?$/.test(value));
    });

    expect(offenders).toEqual([]);
  });

  it("routes inline UI font sizes, weights, and radii through shared tokens", () => {
    const property = /\b(fontSize|fontWeight|borderRadius)\s*:\s*(["']?)(\d+(?:\.\d+)?(?:px|rem|%)?)\2/g;
    const offenders = sourceFiles("src").flatMap((path) => [...read(path).matchAll(property)].map((match) => `${path}: ${match[0]}`));

    expect(offenders).toEqual([]);
  });

  it("provides configurable semantic theme colors for shared UI roles", () => {
    const tokens = read("src/design-system/tokens.css");
    for (const token of [
      "--color-text-primary", "--color-text-secondary", "--color-text-muted",
      "--color-background-page", "--color-background-panel", "--color-surface",
      "--color-border", "--color-accent", "--color-focus", "--color-danger",
      "--color-success", "--color-warning", "--color-premium-text",
      "--color-premium-surface", "--color-premium-border",
    ]) {
      expect(tokens).toContain(`${token}:`);
    }
  });
});
