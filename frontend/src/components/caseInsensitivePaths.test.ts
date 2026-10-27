import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("keeps frontend module paths unique on case-insensitive filesystems", () => {
  const modules = [...new Set(execFileSync("git", ["-C", "..", "ls-files", "frontend/src"], { encoding: "utf8" })
    .split(/\r?\n/).filter(Boolean).map((path) => path.replace(/\.[^.\\/]+$/, "")))];
  expect(new Set(modules.map((path) => path.toLocaleLowerCase("en-US"))).size).toBe(modules.length);
});
