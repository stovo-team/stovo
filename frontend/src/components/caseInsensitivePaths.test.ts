import { expect, it } from "vitest";
it("keeps frontend module paths unique on case-insensitive filesystems", () => {
  const modules = [...new Set(Object.keys(import.meta.glob("../**/*.{ts,tsx}")).map((path) => path.replace(/\.[^.\\/]+$/, "")))];
  expect(new Set(modules.map((path) => path.toLocaleLowerCase("en-US"))).size).toBe(modules.length);
});
