import { hasLiveLocalVideo } from "../shared/callLifecycle";
import { CallAudioSettingsPopup } from "./CallAudioSettingsPopup";
import { CallSettingsContextMenu } from "./CallSettingsContextMenu";
import { CallSpeakerSheet } from "./CallSpeakerSheet";
import { CallVideoSettingsPopup } from "./CallVideoSettingsPopup";
import { DesktopCallControls } from "./DesktopCallControls";
import { GroupCallActiveBanner } from "./GroupCallActiveBanner";
import { GroupCallPreJoinModal } from "./GroupCallPreJoinModal";
import { VoiceChannelStage } from "./VoiceChannelStage";
import { MobileActiveScreen } from "./MobileActiveScreen";
import { MobileIncomingScreen } from "./MobileIncomingScreen";
import { MobileMinimizedCallBar } from "./MobileMinimizedCallBar";
import { useCallTimer } from "./useCallTimer";
import { useCallFeatureContext } from "./CallFeatureContext";

export {
  CallSettingsContextMenu,
  CallAudioSettingsPopup,
  CallVideoSettingsPopup,
  CallSpeakerSheet,
  MobileActiveScreen,
  MobileMinimizedCallBar,
  MobileIncomingScreen,
  GroupCallActiveBanner,
  GroupCallPreJoinModal,
  VoiceChannelStage,
  useCallTimer
};
export { CallFeatureProvider } from "./CallFeatureContext";

/**
 * Call UI composition layer: renders the call popup (backdrop, mobile
 * incoming/active screens, desktop call chrome, settings popups) and the
 * speaker sheet, driven entirely by the `useCallSession` controller. Renders
 * nothing while no call is active — the always-mounted remote `<audio>`
 * element stays in ChatsPage since CallController needs it attached even
 * before a call starts.
 */
export function CallFeature() {
  const { session, isMobileViewport, members, currentUser, chats, onOpenChat } = useCallFeatureContext();
  const {
    callPhase,
    callType,
    isCallMinimized,
    callPeerDisplayName,
    activeCallPeerName,
    isPeerSpeaking,
    isLocalSpeaking,
    isProximityNear,
    callAudioSettings,
    callAudioCapabilities,
    callAudioDevices,
    callAudioWarning,
    callTrackStatus,
    callTimer,
    hasRemoteVideo,
    localVideoStream,
    localScreenStream,
    remoteVideoStream,
    isCallSettingsMenuOpen,
    isCallAudioPopupOpen,
    isCallVideoPopupOpen,
    isSpeakerSheetOpen,
    setIsCallSettingsMenuOpen,
    setIsCallAudioPopupOpen,
    setIsCallVideoPopupOpen,
    setIsSpeakerSheetOpen,
    callSettingsButtonRef,
    callSettingsMenuRef,
    callAudioPopupRef,
    audioCallRef,
    setCallType,
    applyCallAudioPatch,
    toggleScreenShare,
    acceptIncomingCall,
    declineIncomingCall,
    endActiveCall,
    callNotice,
    activeGroupCalls,
    preJoinChatId,
    closePreJoinModal,
    joinOngoingGroupCall
  } = session;

  const preJoinChat = preJoinChatId ? chats.find((c) => c.id === preJoinChatId) ?? null : null;
  const preJoinActiveCall = preJoinChatId ? activeGroupCalls[preJoinChatId] : null;

  const activeChat = session.activeCallChatId ? chats.find((c) => c.id === session.activeCallChatId) : null;
  const isVoiceChannel = activeChat?.type === "voice";
  const isGroupCall = activeChat ? activeChat.type === "group" || activeChat.type === "family" : false;
  // Voice channels use the persistent call header owned by ChatsPage when
  // minimized. Keeping them out of the generic popup prevents minimization
  // from looking like the room ended or from creating a second call surface.
  const shouldRenderCallPopup = callPhase !== "idle" && !isVoiceChannel;
  const effectiveIsCallMinimized = isCallMinimized;

  const activePeer = members.find((m) => m.id === session.callPeerUserId) ||
    activeChat?.members?.find((m) => m.id === session.callPeerUserId) ||
    activeChat?.members?.find((m) => m.id !== currentUser?.id);
  const peerProfilePhoto = activePeer?.profilePhoto ?? null;

  if (callPhase === "idle" && !preJoinChatId) {
    return null;
  }

  return (
    <>
      {preJoinChatId && preJoinActiveCall && preJoinChat && (
        <GroupCallPreJoinModal
          chatTitle={preJoinChat.title ?? "Group Chat"}
          callType={(preJoinActiveCall.callType as "audio" | "video") || "audio"}
          onClose={closePreJoinModal}
          onJoin={(settings) => {
            void joinOngoingGroupCall(preJoinChat, preJoinActiveCall, settings);
          }}
        />
      )}
      {shouldRenderCallPopup && (
        <>
          {!effectiveIsCallMinimized && !isMobileViewport && (
            <div className="call-popup-backdrop-overlay" aria-hidden="true" />
          )}
          <section
            className={[
              "call-popup",
              effectiveIsCallMinimized ? "call-popup-minimized" : "",
              isMobileViewport ? "call-popup-fullscreen" : "",
              effectiveIsCallMinimized && isMobileViewport ? "call-popup-slim-host" : "",
            ].filter(Boolean).join(" ")}
            role="dialog"
            aria-modal="false"
            aria-label={
              callPhase === "incoming"
                ? "Incoming call"
                : callPhase === "outgoing"
                ? "Outgoing call"
                : "Active call"
            }
          >
            {/* Mobile incoming call full-screen */}
            {isMobileViewport && !isCallMinimized && callPhase === "incoming" && (
              <MobileIncomingScreen
                peerName={(callPeerDisplayName ?? activeCallPeerName) ?? ""}
                peerProfilePhoto={peerProfilePhoto}
                accessToken={session.accessToken ?? null}
                callType={callType}
                onAccept={() => void acceptIncomingCall()}
                onDecline={declineIncomingCall}
              />
            )}
            {/* Mobile active call full-screen */}
            {isMobileViewport && !isCallMinimized && callPhase !== "incoming" && (
              <MobileActiveScreen
                peerName={(callPeerDisplayName ?? activeCallPeerName) ?? ""}
                peerProfilePhoto={peerProfilePhoto}
                accessToken={session.accessToken ?? null}
                callType={callType}
                callPhase={callPhase}
                isPeerSpeaking={isPeerSpeaking}
                isLocalSpeaking={isLocalSpeaking}
                isProximityNear={isProximityNear}
                isMicMuted={callAudioSettings.micMuted}
                isCameraEnabled={callAudioSettings.cameraEnabled}
                isScreenSharing={callAudioSettings.screenSharing}
                canShareScreen={callAudioCapabilities.canShareScreen}
                cameraFacingMode={callAudioSettings.cameraFacingMode}
                speakerMode={callAudioSettings.speakerMode}
                timer={callTimer}
                hasRemoteVideo={hasRemoteVideo}
                localVideoStream={localVideoStream}
                localScreenStream={localScreenStream}
                remoteVideoStream={remoteVideoStream}
                remoteMedia={session.callRemoteMedia}
                localUserLabel={currentUser?.displayName ?? "You"}
                speakingUserIds={session.speakingUserIds}
                mirrorLocalVideo={callAudioSettings.mirrorLocalVideo}
                onToggleMic={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
                onToggleCamera={() => {
                  if (!hasLiveLocalVideo(localVideoStream)) {
                    setCallType("video");
                    void audioCallRef.current?.toggleVideo(true);
                  } else {
                    void applyCallAudioPatch({ cameraEnabled: !callAudioSettings.cameraEnabled });
                  }
                }}
                onToggleScreenShare={() => void toggleScreenShare()}
                onToggleFlip={() =>
                  applyCallAudioPatch({
                    cameraFacingMode:
                      callAudioSettings.cameraFacingMode === "user" ? "environment" : "user",
                  })
                }
                onOpenSpeakerSheet={() => setIsSpeakerSheetOpen(true)}
                onEnd={() => void endActiveCall()}
                onShrink={() => session.setIsCallMinimized(true)}
                notice={callNotice}
              />
            )}

            <DesktopCallControls />
          </section>
        </>
      )}
      {/* Settings menus & popups */}
      {isCallSettingsMenuOpen && (
        <CallSettingsContextMenu
          anchorRef={callSettingsButtonRef}
          menuRef={callSettingsMenuRef}
          onOpenAudioSettings={() => {
            setIsCallSettingsMenuOpen(false);
            setIsCallAudioPopupOpen(true);
          }}
          onOpenVideoSettings={() => {
            setIsCallSettingsMenuOpen(false);
            setIsCallVideoPopupOpen(true);
          }}
        />
      )}
      {isCallAudioPopupOpen && (
        <CallAudioSettingsPopup
          popupRef={callAudioPopupRef}
          isMobile={isMobileViewport}
          settings={callAudioSettings}
          capabilities={callAudioCapabilities}
          devices={callAudioDevices}
          trackStatus={callTrackStatus}
          warning={callAudioWarning}
          onPatch={(patch) => void applyCallAudioPatch(patch)}
          onClose={() => setIsCallAudioPopupOpen(false)}
        />
      )}
      {isCallVideoPopupOpen && (
        <CallVideoSettingsPopup
          settings={callAudioSettings}
          capabilities={callAudioCapabilities}
          devices={callAudioDevices}
          isMobile={isMobileViewport}
          onPatch={(patch) => void applyCallAudioPatch(patch)}
          onClose={() => setIsCallVideoPopupOpen(false)}
        />
      )}
      {isSpeakerSheetOpen && (
        <CallSpeakerSheet
          devices={callAudioDevices}
          currentOutputDeviceId={callAudioSettings.outputDeviceId}
          speakerMode={callAudioSettings.speakerMode}
          onSelect={(deviceId, mode) => {
            if (deviceId !== null) {
              void applyCallAudioPatch({ outputDeviceId: deviceId, speakerMode: mode });
            } else {
              void applyCallAudioPatch({ speakerMode: mode, outputDeviceId: "" });
            }
          }}
          onClose={() => setIsSpeakerSheetOpen(false)}
        />
      )}
    </>
  );
}

