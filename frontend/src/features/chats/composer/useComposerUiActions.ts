import { RefObject } from "react";
import { Message } from "../../../api/chats";

type Options = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  setAttachmentSheetOpen: (open: boolean) => void;
  closeEmojiPicker: () => void;
  setAttachmentSheetInitialTab: (tab: "gallery") => void;
  setEditTargetMessage: (message: Message | null) => void;
  setMessageContextMenu: (menu: null) => void;
};

export function useComposerUiActions(options: Options) {
  const { inputRef, setAttachmentSheetOpen, closeEmojiPicker, setEditTargetMessage, setMessageContextMenu } = options;
  function focusInput() { window.setTimeout(() => inputRef.current?.focus(), 0); }
  function handleAttachButtonClick() { closeEmojiPicker(); setAttachmentSheetOpen(true); options.setAttachmentSheetInitialTab("gallery"); }
  function handleEditMessage(message: Message) { setEditTargetMessage(message); setMessageContextMenu(null); }
  function cancelEditMode() { setEditTargetMessage(null); }
  return { focusInput, handleAttachButtonClick, handleEditMessage, cancelEditMode };
}
