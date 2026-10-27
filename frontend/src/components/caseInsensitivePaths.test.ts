import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("keeps frontend module paths unique on case-insensitive filesystems", () => {
  const paths = execFileSync("git", ["-C", "..", "ls-files", "frontend/src"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const path of paths) {
    const module = path.replace(/\.[^.\\/]+$/, "");
    const key = module.toLocaleLowerCase("en-US");
    const previous = seen.get(key);
    if (previous && previous !== module) collisions.push(`${previous} and ${module}`);
    else seen.set(key, module);
  }
  expect(collisions).toEqual([]);
});
