import { useEffect } from "react";
import { resetFloatingCallPosition } from "./useFloatingCallPanel";
import { useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
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
import { MinimizedCallBar } from "./MinimizedCallBar";
import { useCallTimer } from "./useCallTimer";
import { CallFeatureProvider as CallFeatureContextProvider, useCallFeatureContext } from "./CallFeatureContext";
import { enableCallCamera } from "./callCamera";

export {
  CallSettingsContextMenu,
  CallAudioSettingsPopup,
  CallVideoSettingsPopup,
  CallSpeakerSheet,
  MobileActiveScreen,
  MinimizedCallBar,
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
  const { pathname } = useLocation();
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
  const isGroupCallSharing = isGroupCall && (
    callAudioSettings.screenSharing || session.callRemoteMedia.some((media) => media.hasScreenShare)
  );
  // Expanded voice channels live in the conversation. Every minimized call
  // is owned here, outside route surfaces, so only one call bar can appear.
  const isOnChatsRoute = /^(?:\/s\/[^/]+)?\/app\/chats(?:\/[^/]+)?\/?$/.test(pathname);
  const routeMinimized = callPhase !== "idle" && !isOnChatsRoute;
  useEffect(() => { if (callPhase === "idle") resetFloatingCallPosition(); }, [callPhase]);
  const effectiveIsCallMinimized = isCallMinimized || routeMinimized;
  const shouldRenderCallPopup = callPhase !== "idle" && !isVoiceChannel;
  const shouldUseFullscreenSurface = isMobileViewport || (isGroupCallSharing && !effectiveIsCallMinimized);

  const callUiSession = {
    ...session,
    isCallMinimized: isCallMinimized || routeMinimized,
    setIsCallMinimized: (value: boolean | ((current: boolean) => boolean)) => {
      const nextValue = typeof value === "function" ? value(isCallMinimized || routeMinimized) : value;
      session.setIsCallMinimized(nextValue);
    },
  };

  const activePeer = members.find((m) => m.id === session.callPeerUserId) ||
    activeChat?.members?.find((m) => m.id === session.callPeerUserId) ||
    activeChat?.members?.find((m) => m.id !== currentUser?.id);
  const peerProfilePhoto = activePeer?.profilePhoto ?? null;
  const participantProfiles = Object.fromEntries(
    [...members, ...(activeChat?.members ?? [])].map((member) => [member.id, {
      displayName: member.displayName,
      profilePhoto: member.profilePhoto ?? null,
    }]),
  );
  if (currentUser) {
    participantProfiles[currentUser.displayName] = {
      displayName: currentUser.displayName,
      profilePhoto: currentUser.profilePhoto ?? null,
    };
  }

  if (callPhase === "idle" && !preJoinChatId) {
    return null;
  }

  const callUi = (
    <>
      <MinimizedCallBar
          key={session.callRoomId ?? session.activeCallChatId ?? "call"}
          visible={effectiveIsCallMinimized}
          soundDisabled={callAudioSettings.soundDisabled}
          onToggleSound={() => void applyCallAudioPatch({ soundDisabled: !callAudioSettings.soundDisabled })}
          remoteMedia={session.callRemoteMedia.length ? session.callRemoteMedia : remoteVideoStream ? [{ userId: session.callPeerUserId ?? "peer", stream: remoteVideoStream, screenStream: null, hasVideo: hasRemoteVideo, hasAudio: true, hasScreenShare: false }] : []}
          localVideoStream={localVideoStream}
          localScreenStream={localScreenStream}
          cameraEnabled={callAudioSettings.cameraEnabled}
          screenSharing={callAudioSettings.screenSharing}
          localUserId={currentUser?.id ?? "self"}
          speakingUserIds={session.speakingUserIds}
          isLocalSpeaking={isLocalSpeaking}
          isPeerSpeaking={isPeerSpeaking}
          mirrorLocalVideo={callAudioSettings.mirrorLocalVideo && callAudioSettings.cameraFacingMode === "user"}
          peerName={(callPeerDisplayName ?? activeCallPeerName) ?? (activeChat?.title ?? "Call")}
          callPhase={callPhase}
          callTimer={callTimer}
          micMuted={callAudioSettings.micMuted}
          onToggleMic={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
          onEnd={() => void endActiveCall()}
          onExpand={() => {
            callUiSession.setIsCallMinimized(false);
            if (activeChat) onOpenChat?.(activeChat);
          }}
        />
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
            hidden={effectiveIsCallMinimized}
            style={effectiveIsCallMinimized ? { display: "none" } : undefined}
            className={[
              "call-popup",
              shouldUseFullscreenSurface ? "call-popup-fullscreen" : "",
              isGroupCall ? "call-popup-group-call" : "",
              isGroupCallSharing ? "call-popup-group-call--sharing" : "",
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
            {isMobileViewport && !effectiveIsCallMinimized && callPhase === "incoming" && (
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
            {isMobileViewport && !effectiveIsCallMinimized && callPhase !== "incoming" && (
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
                    void enableCallCamera(audioCallRef.current, setCallType, applyCallAudioPatch);
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
                onOpenSettings={() => setIsCallAudioPopupOpen(true)}
                onEnd={() => void endActiveCall()}
                onShrink={() => session.setIsCallMinimized(true)}
                notice={callNotice}
                roomId={session.callRoomId}
                currentUserId={currentUser?.id}
                socketRef={session.socketRef}
                isGroupCall={isGroupCall}
                participantProfiles={participantProfiles}
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
          localStream={audioCallRef.current?.getLocalStream() ?? localVideoStream}
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

  const callUiWithContext = (
    <CallFeatureContextProvider
      session={callUiSession}
      isMobileViewport={isMobileViewport}
      members={members}
      currentUser={currentUser}
      chats={chats}
      onOpenChat={onOpenChat}
    >
      {callUi}
    </CallFeatureContextProvider>
  );

  return typeof document !== "undefined" ? createPortal(callUiWithContext, document.body) : callUiWithContext;
}
