import { describe, expect, it } from "vitest";

import {
  initialStorageSelection,
  shouldOpenStorageTilePreview,
  storageSelectionReducer
} from "./storageSelection";

describe("storageSelectionReducer", () => {
  it("keeps mobile details closed when the desktop default file is selected", () => {
    const state = storageSelectionReducer(initialStorageSelection, {
      type: "load-default",
      fileId: "first-file"
    });

    expect(state).toEqual({ selectedFileId: "first-file", mobileDetailsOpen: false });
  });

  it("opens details only after an explicit file action and closes back to Storage", () => {
    const opened = storageSelectionReducer(initialStorageSelection, {
      type: "open",
      fileId: "chosen-file"
    });
    const closed = storageSelectionReducer(opened, { type: "close" });

    expect(opened).toEqual({ selectedFileId: "chosen-file", mobileDetailsOpen: true });
    expect(closed).toEqual({ selectedFileId: "chosen-file", mobileDetailsOpen: false });
  });

  it("resets a previously opened preview when Storage is entered again", () => {
    const opened = storageSelectionReducer(initialStorageSelection, {
      type: "open",
      fileId: "chosen-file"
    });

    expect(storageSelectionReducer(opened, { type: "reset-gallery" })).toEqual({
      selectedFileId: null,
      mobileDetailsOpen: false
    });
  });

  it("does not open the image lightbox from a tile tap on mobile", () => {
    expect(shouldOpenStorageTilePreview(true, true)).toBe(false);
    expect(shouldOpenStorageTilePreview(true, false)).toBe(true);
    expect(shouldOpenStorageTilePreview(false, false)).toBe(false);
  });
});
