import { expect, it } from "vitest";
import { storagePreviewVideoStyle } from "./storagePreviewStyle";

it("uses more of a large desktop viewport while preserving the media aspect ratio", () => {
  expect(storagePreviewVideoStyle(1920, 1080, 2560, 1440, false)).toMatchObject({width: "1200px", height: "675px"});
  expect(storagePreviewVideoStyle(1920, 1080, 2560, 1440, true)).toMatchObject({width: "1920px", height: "1080px"});
});

it("keeps smaller screens within their existing viewport bounds", () => {
  expect(storagePreviewVideoStyle(1920, 1080, 560, 500, false)).toMatchObject({width: "448px", height: "252px"});
});
