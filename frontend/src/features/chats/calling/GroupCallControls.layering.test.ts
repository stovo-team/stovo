import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const styles = readFileSync("src/styles.css", "utf8");
const rule = (selector: string) => { const start=styles.lastIndexOf(`${selector} {`); return start < 0 ? "" : styles.slice(start,styles.indexOf("}",start)); };
it("keeps regular group-call header buttons above participant cards", () => {
  const header=rule('.call-popup-group-call:not(.call-popup-fullscreen) > .call-popup-header');
  expect(header).toContain('position: relative;');
  expect(header).toContain('z-index: 40;');
});
it("raises the actual dock wrapper above the stage, including on laptops", () => {
  expect(rule('.call-popup.call-popup-group-call > .shared-call-control-panel')).toContain('z-index: 50;');
  expect(rule('.call-popup.call-popup-group-call > .shared-call-stage')).toContain('isolation: isolate;');
});
