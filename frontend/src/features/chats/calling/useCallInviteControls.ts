import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type CallController from "../../../realtime/CallController";

type CallInviteControlsParams = {
  audioCallRef: MutableRefObject<CallController | null>;
  callInviteSelection: string[];
  setCallInviteSelection: Dispatch<SetStateAction<string[]>>;
  setIsCallInviteOpen: Dispatch<SetStateAction<boolean>>;
  onInvite?: (userIds: string[]) => void;
};

/** Encapsulates invite-sheet submission without exposing controller details to UI. */
export function useCallInviteControls({
  audioCallRef,
  callInviteSelection,
  setCallInviteSelection,
  setIsCallInviteOpen,
  onInvite
}: CallInviteControlsParams) {
  return useCallback(() => {
    if (!callInviteSelection.length) {
      setIsCallInviteOpen(false);
      return;
    }
    if (onInvite) onInvite(callInviteSelection);
    else audioCallRef.current?.inviteUsers(callInviteSelection);
    setIsCallInviteOpen(false);
    setCallInviteSelection([]);
  }, [audioCallRef, callInviteSelection, setCallInviteSelection, setIsCallInviteOpen, onInvite]);
}
