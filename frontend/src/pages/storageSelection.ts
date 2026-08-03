export interface StorageSelectionState {
  selectedFileId: string | null;
  mobileDetailsOpen: boolean;
}

export type StorageSelectionAction =
  | { type: "load-default"; fileId: string | null }
  | { type: "open"; fileId: string }
  | { type: "select"; fileId: string | null }
  | { type: "close" }
  | { type: "reset-gallery" }
  | { type: "remove"; fileId: string };

export const initialStorageSelection: StorageSelectionState = {
  selectedFileId: null,
  mobileDetailsOpen: false
};

export function shouldOpenStorageTilePreview(hasPreview: boolean, isMobileViewport: boolean) {
  return false;
}

export function storageTileSelectionAction(isMobileViewport: boolean, fileId: string): StorageSelectionAction {
  return isMobileViewport ? { type: "open", fileId } : { type: "select", fileId };
}

export function storageSelectionReducer(
  state: StorageSelectionState,
  action: StorageSelectionAction
): StorageSelectionState {
  switch (action.type) {
    case "load-default":
      return { selectedFileId: state.selectedFileId, mobileDetailsOpen: false };
    case "open":
      return { selectedFileId: action.fileId, mobileDetailsOpen: true };
    case "select":
      return { ...state, selectedFileId: action.fileId };
    case "close":
      return { selectedFileId: null, mobileDetailsOpen: false };
    case "reset-gallery":
      return initialStorageSelection;
    case "remove":
      return state.selectedFileId === action.fileId
        ? { selectedFileId: null, mobileDetailsOpen: false }
        : state;
  }
}
