import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readCssSource } from "./cssSource";

const fixtureRoots: string[] = [];

function cssFixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "stovo-css-source-"));
  fixtureRoots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return join(root, "styles.css");
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

it("expands local CSS imports in source order and resolves nested imports relative to their parent", () => {
  const entry = cssFixture({
    "styles.css": '@import "./styles/base.css";\n@import "./styles/page.css";\nbody { color: black; }\n',
    "styles/base.css": ".base { color: blue; }\n",
    "styles/page.css": '@import "./nested/panel.css";\n.page { color: red; }\n',
    "styles/nested/panel.css": ".panel { color: green; }\n",
  });

  expect(readCssSource(entry)).toBe(
    ".base { color: blue; }\n.panel { color: green; }\n.page { color: red; }\nbody { color: black; }\n",
  );
});

it("keeps repeated imports repeated", () => {
  const entry = cssFixture({
    "styles.css": '@import "./styles/reused.css";\n@import "./styles/reused.css";\n',
    "styles/reused.css": ".reused {}\n",
  });

  expect(readCssSource(entry)).toBe(".reused {}\n.reused {}\n");
});

it("reports the complete path when local imports form a cycle", () => {
  const entry = cssFixture({
    "styles.css": '@import "./styles/first.css";\n',
    "styles/first.css": '@import "./second.css";\n',
    "styles/second.css": '@import "./first.css";\n',
  });

  expect(() => readCssSource(entry)).toThrow(/CSS import cycle/);
  expect(() => readCssSource(entry)).toThrow(/first\.css.*second\.css.*first\.css/);
});

it("rejects missing and non-local stylesheet imports", () => {
  const missing = cssFixture({ "styles.css": '@import "./styles/missing.css";\n' });
  expect(() => readCssSource(missing)).toThrow(/missing\.css/);

  const remote = cssFixture({ "styles.css": '@import "https:\/\/example.com\/styles.css";\n' });
  expect(() => readCssSource(remote)).toThrow(/unsupported CSS import/i);
});

it("returns a stylesheet without imports unchanged", () => {
  const css = "body { color: black; }\n";
  const entry = cssFixture({ "styles.css": css });

  expect(readCssSource(entry)).toBe(css);
});
