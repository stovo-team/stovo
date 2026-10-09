import type CallController from "../../../realtime/CallController";
import { hasLiveLocalVideo } from "../shared/callLifecycle";

type CameraController = Pick<CallController, "toggleVideo" | "getLocalStream">;
type CameraSettingUpdater = (patch: { cameraEnabled: boolean }) => Promise<void>;

export async function enableCallCamera(
  controller: CameraController | null,
  setCallType: (type: "audio" | "video") => void,
  applyCallAudioPatch: CameraSettingUpdater,
): Promise<boolean> {
  if (!controller) return false;

  setCallType("video");
  try {
    await controller.toggleVideo(true);
  } catch {
    setCallType("audio");
    await applyCallAudioPatch({ cameraEnabled: false });
    return false;
  }

  if (!hasLiveLocalVideo(controller.getLocalStream())) {
    setCallType("audio");
    await applyCallAudioPatch({ cameraEnabled: false });
    return false;
  }

  await applyCallAudioPatch({ cameraEnabled: true });
  return true;
}
