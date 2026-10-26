import { readCssSource } from "../test/cssSource";
import { expect, it } from "vitest";

it("hides the source sidebar toggle while a full-page folder is open", () => {
  const styles = readCssSource("src/styles.css");
  const rule = styles.match(/\.storage-page:has\(\.storage-collection-full-page\) \.storage-source-collapse\s*\{([^}]+)\}/)?.[1];
  expect(rule).toContain("display: none;");
});

it("anchors the open folder to the storage panel without adding the navigation offset twice", () => {
  const styles = readCssSource("src/styles.css");
  const rules = [...styles.matchAll(/\.storage-page \.storage-collection-full-page\s*\{([^}]+)\}/g)].map((match) => match[1]);
  expect(rules.some((rule) => rule.includes("position: absolute;") && rule.includes("inset: 0;") && rule.includes("padding: 16px;"))).toBe(true);
  expect(rules.join(" ")).not.toContain("inset-inline-start:");
  expect(rules.join(" ")).not.toContain("--nav-rail-width");
});
