import { readCssSource } from "../test/cssSource";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import postcss from "postcss";

const cssFiles = [
  "src/styles.css",
  "src/pages/MultiAdminPage.css",
  "src/pages/AdminServerSettingsPage.css",
  "src/features/chats/calling/floatingCallPanel.css",
];
const require = createRequire(import.meta.url);
const cssNamedColors = Object.keys(require("color-name") as Record<string, unknown>).sort((a, b) => b.length - a.length).join("|");
const read = (path: string) => readFileSync(path, "utf8");
const colorLiteral = new RegExp(`#(?:[\\da-f]{3,8})\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\([^)]*\\)|\\b(?:${cssNamedColors})\\b`, "gi");
const colorStyleProperty = /(?:^|[-_])(?:color|background|border|shadow|outline|fill|stroke|accent|caret|surface|text|overlay|scrim|ring|highlight|badge|gradient|avatar|focus|glass|status|alert|empty|premium|action|success|danger|warning|media|waveform|selection)(?:$|[-_])/i;
const sourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  return entry.isFile() && entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [path] : [];
});
const sourceCodeFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return sourceCodeFiles(path);
  return entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
});

describe("shared design tokens", () => {
  it("uses compact text for chat detail tabs and the configured control size for member invitation", () => {
    const styles = readCssSource("src/styles.css");
    const rule = (selector: string) => styles.match(new RegExp(`${selector}\\s*\\{([^}]+)\\}`))?.[1] ?? "";

    expect(rule("\\.chat-info-tab")).toContain("font-size: var(--font-size-caption)");
    expect(rule("\\.chat-info-member-invite")).toContain("font-size: var(--font-size-button)");
  });

  it("routes discrete production font sizes through the shared scale", () => {
    const offenders = cssFiles.flatMap((path) => {
      const css = readCssSource(path);
      return [...css.matchAll(/font-size\s*:\s*([^;]+);/g)]
        .map((match) => match[1].trim())
        .filter((value) => !value.includes("var(--font-size-") && !/^(inherit|initial|unset|revert)$/.test(value));
    });

    expect(offenders).toEqual([]);
  });

  it("routes numeric production font weights through the shared scale", () => {
    const offenders = cssFiles.flatMap((path) => {
      const css = readCssSource(path);
      return [...css.matchAll(/font-weight\s*:\s*([^;]+);/g)]
        .map((match) => match[1].trim())
        .filter((value) => !value.startsWith("var(--font-weight-") && !/^(inherit|initial|unset|revert|normal|bold|bolder|lighter)$/.test(value));
    });

    expect(offenders).toEqual([]);
  });

  it("routes production font stacks through shared family tokens", () => {
    const offenders = cssFiles.flatMap((path) => {
      const css = readCssSource(path);
      return [...css.matchAll(/(?<![-\w])font-family\s*:\s*([^;]+);/g)]
        .map((match) => match[1].trim())
        .filter((value) => !value.startsWith("var(--font-family-") && !value.startsWith("var(--message-font-family") && !/^(inherit|initial|unset|revert|"Material Symbols Outlined")$/.test(value));
    });

    expect(offenders).toEqual([]);
  });

  it("routes production corner radii through the shared scale", () => {
    const radiusProperty = /(?:border-radius|border-(?:top|bottom)-(?:left|right)-radius)\s*:\s*([^;]+);/g;
    const offenders = cssFiles.flatMap((path) => {
      const css = readCssSource(path);
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

  it("routes authored production CSS colors through the shared palette", () => {
    const offenders = cssFiles.flatMap((path) => {
      const stylesheet = postcss.parse(readCssSource(path), { from: path });
      const found: string[] = [];
      stylesheet.walkDecls((declaration) => {
        if (!colorStyleProperty.test(declaration.prop) || /data:image\/svg\+xml/i.test(declaration.value)) return;
        for (const match of declaration.value.matchAll(colorLiteral)) {
          found.push(`${path}:${declaration.source?.start?.line ?? 0} ${declaration.prop}: ${match[0]}`);
        }
      });
      return found;
    });

    expect(offenders).toEqual([]);

    const sourcePaths = sourceFiles("src");
    const tsxOffenders = sourcePaths.flatMap((path) => {
      const source = read(path);
      const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const found: string[] = [];
      const addLiteral = (node: ts.StringLiteralLike, property: string) => {
        const kebabProperty = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        if (!colorStyleProperty.test(kebabProperty)) return;
        for (const match of node.text.matchAll(colorLiteral)) found.push(`${path} ${property}: ${match[0]}`);
      };
      const visitStyleObject = (node: ts.ObjectLiteralExpression) => {
        for (const property of node.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          if (ts.isIdentifier(property.name) && ts.isStringLiteralLike(property.initializer)) {
            addLiteral(property.initializer, property.name.text);
          }
          if (ts.isObjectLiteralExpression(property.initializer)) visitStyleObject(property.initializer);
        }
      };
      const visit = (node: ts.Node) => {
        if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && ts.isStringLiteralLike(node.initializer)) {
          addLiteral(node.initializer, node.name.text);
        }
        if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.initializer && ts.isStringLiteral(node.initializer)) {
          addLiteral(node.initializer, node.name.text);
        }
        if (ts.isJsxAttribute(node) && node.name.getText(ast) === "style" && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isObjectLiteralExpression(node.initializer.expression)) {
          visitStyleObject(node.initializer.expression);
        }
        if (ts.isVariableDeclaration(node) && node.type?.getText(ast).includes("CSSProperties") && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
          visitStyleObject(node.initializer);
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
      return found;
    });
    expect(tsxOffenders).toEqual([]);
  });

  it("defines every literal palette token used by authored styles", () => {
    const tokens = read("src/design-system/tokens.css");
    const defined = new Set([...tokens.matchAll(/(--color-palette-[a-f0-9]+)\s*:/g)].map((match) => match[1]));
    const styles = [...cssFiles.map(readCssSource), ...sourceFiles("src").map(read)].join("\n");
    const used = new Set([...styles.matchAll(/var\((--color-palette-[a-f0-9]+)/g)].map((match) => match[1]));

    expect([...used].filter((token) => !defined.has(token))).toEqual([]);
  });

  it("keeps static TSX color values in the design-system data palette", () => {
    const offenders: string[] = [];
    for (const path of sourceFiles("src")) {
      const ast = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteralLike(node)) {
          for (const match of node.text.matchAll(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)/gi)) {
            offenders.push(`${path}: ${match[0]}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps authored TypeScript colors in a configuration file", () => {
    const allowedConfig = (path: string) => path === "src/design-system/palette.ts"
      || path.startsWith("src/config/colors/")
      || path.startsWith("src/config/strings/")
      || path === "src/plugins/themePlugin.ts";
    const offenders: string[] = [];
    for (const path of sourceCodeFiles("src")) {
      if (allowedConfig(path)) continue;
      const ast = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const check = (value: string) => {
        for (const match of value.matchAll(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)/gi)) offenders.push(`${path}: ${match[0]}`);
      };
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteralLike(node)) check(node.text);
        if (ts.isTemplateExpression(node)) {
          check(node.head.text);
          for (const span of node.templateSpans) check(span.literal.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps typed application color data represented in the CSS palette", () => {
    const tokenSource = read("src/design-system/tokens.css");
    const paletteComments = new Set([...tokenSource.matchAll(/--color-palette-[a-f0-9]+\s*:[^;]+;\s*\/\*\s*(.*?)\s*\*\//g)].map((match) => match[1].toLowerCase().replace(/\s+/g, "")));
    const paletteSource = read("src/design-system/palette.ts");
    const paletteColors = [...paletteSource.matchAll(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)/gi)].map((match) => match[0].toLowerCase().replace(/\s+/g, ""));
    const canonicalVariants = (value: string) => {
      if (/^#[\da-f]{3,8}$/.test(value) && (value.length === 4 || value.length === 5)) {
        return [`#${[...value.slice(1)].map((character) => character + character).join("")}`];
      }
      const rgba = value.match(/^rgba\((.*)\)$/);
      return rgba ? [value, `rgb(${rgba[1]})`] : [value];
    };

    expect(paletteColors.filter((color) => !canonicalVariants(color).some((variant) => paletteComments.has(variant)))).toEqual([]);
  });
});
