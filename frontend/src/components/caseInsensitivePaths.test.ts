import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("frontend source paths", () => {
  it("are unique on case-insensitive filesystems", () => {
    const paths = execFileSync("git", ["-C", "..", "ls-files", "frontend/src"], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
    const seen = new Map<string, string>();
    const collisions: string[] = [];

    for (const sourcePath of paths) {
      const modulePath = sourcePath.replace(/\.[^.\\/]+$/, "");
      const key = modulePath.toLocaleLowerCase("en-US");
      const priorPath = seen.get(key);
      if (priorPath && priorPath !== modulePath) collisions.push(`${priorPath} and ${modulePath}`);
      else seen.set(key, modulePath);
    }

    expect(collisions).toEqual([]);
  });
});
