import { describe, expect, it } from "vitest";

import {
  initialStorageSelection,
  storageTileSelectionAction,
  shouldOpenStorageTilePreview,
  storageSelectionReducer
} from "./storageSelection";

describe("storageSelectionReducer", () => {
  it("keeps the desktop gallery unselected after loading files", () => {
    const state = storageSelectionReducer(initialStorageSelection, {
      type: "load-default",
      fileId: "first-file"
    });

    expect(state).toEqual({ selectedFileId: null, mobileDetailsOpen: false });
  });

  it("opens details only after an explicit file action and closes back to Storage", () => {
    const opened = storageSelectionReducer(initialStorageSelection, {
      type: "open",
      fileId: "chosen-file"
    });
    const closed = storageSelectionReducer(opened, { type: "close" });

    expect(opened).toEqual({ selectedFileId: "chosen-file", mobileDetailsOpen: true });
    expect(closed).toEqual({ selectedFileId: null, mobileDetailsOpen: false });
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

  it("keeps the gallery unselected after its initial file load", () => {
    expect(
      storageSelectionReducer(initialStorageSelection, { type: "load-default", fileId: "file-1" })
    ).toEqual({ selectedFileId: null, mobileDetailsOpen: false });
  });

  it("does not open the image lightbox from a tile click on either layout", () => {
    expect(shouldOpenStorageTilePreview(true, true)).toBe(false);
    expect(shouldOpenStorageTilePreview(true, false)).toBe(false);
    expect(shouldOpenStorageTilePreview(false, false)).toBe(false);
  });

  it("opens the bottom sheet only for a mobile tile selection", () => {
    expect(storageTileSelectionAction(false, "file-1")).toEqual({ type: "select", fileId: "file-1" });
    expect(storageTileSelectionAction(true, "file-1")).toEqual({ type: "open", fileId: "file-1" });
  });
});
