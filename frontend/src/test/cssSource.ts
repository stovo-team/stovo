import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import postcss from "postcss";

export function readCssSource(entryPath: string): string {
  function expand(filePath: string, activeImports: string[]): string {
    const absolutePath = resolve(filePath);
    if (activeImports.includes(absolutePath)) {
      throw new Error(`CSS import cycle: ${[...activeImports, absolutePath].join(" -> ")}`);
    }

    const source = readFileSync(absolutePath, "utf8");
    const root = postcss.parse(source, { from: absolutePath });
    const imports: Array<{ start: number; end: number; path: string }> = [];

    root.walkAtRules("import", (atRule) => {
      const match = /^(?:"([^"]+)"|'([^']+)')$/.exec(atRule.params.trim());
      const importPath = match?.[1] ?? match?.[2];
      if (
        !importPath ||
        !importPath.endsWith(".css") ||
        isAbsolute(importPath) ||
        /^[a-z][a-z\d+.-]*:/i.test(importPath) ||
        importPath.startsWith("//")
      ) {
        throw new Error(`Unsupported CSS import in ${absolutePath}: @import ${atRule.params}`);
      }

      const start = atRule.source?.start.offset;
      const ruleEnd = atRule.source?.end.offset;
      if (start === undefined || ruleEnd === undefined) {
        throw new Error(`CSS import has no source location in ${absolutePath}`);
      }

      let end = ruleEnd + 1;
      if (source.slice(end, end + 2) === "\r\n") {
        end += 2;
      } else if (source[end] === "\n") {
        end += 1;
      }
      imports.push({ start, end, path: resolve(dirname(absolutePath), importPath) });
    });

    let expanded = source;
    for (const item of imports.reverse()) {
      expanded =
        expanded.slice(0, item.start) +
        expand(item.path, [...activeImports, absolutePath]) +
        expanded.slice(item.end);
    }
    return expanded;
  }

  return expand(entryPath, []);
}
