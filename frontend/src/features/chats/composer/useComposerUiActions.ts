import { RefObject } from "react";
import { Message } from "../../../api/chats";

type Options = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  setAttachmentSheetOpen: (open: boolean) => void;
  closeEmojiPicker: () => void;
  setEditTargetMessage: (message: Message | null) => void;
  setMessageContextMenu: (menu: null) => void;
};

export function useComposerUiActions(options: Options) {
  const { inputRef, setAttachmentSheetOpen, closeEmojiPicker, setEditTargetMessage, setMessageContextMenu } = options;
  function focusInput() { window.setTimeout(() => inputRef.current?.focus(), 0); }
  function handleAttachButtonClick() { closeEmojiPicker(); setAttachmentSheetOpen(true); }
  function handleEditMessage(message: Message) { setEditTargetMessage(message); setMessageContextMenu(null); }
  function cancelEditMode() { setEditTargetMessage(null); }
  return { focusInput, handleAttachButtonClick, handleEditMessage, cancelEditMode };
}
