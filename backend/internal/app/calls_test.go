package app

import (
	"context"
	"testing"
	"time"

	"stovo-messenger/backend/internal/adapters/realtimecache"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestCallHistoryStatus(t *testing.T) {
	tests := []struct {
		name    string
		state   callState
		reason  string
		want    string
		isFinal bool
	}{
		{name: "timeout is missed", state: callStateRinging, reason: "timeout", want: "missed"},
		{name: "decline is declined", state: callStateRinging, reason: "declined", want: "declined"},
		{name: "cancel is canceled", state: callStateRinging, reason: "canceled", want: "canceled"},
		{name: "ended before connection is failed", state: callStateConnecting, reason: "ended", want: "failed"},
		{name: "connected call is completed", state: callStateConnected, reason: "ended", want: "completed", isFinal: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, isFinal := callHistoryStatus(tt.state, tt.reason)
			if status != tt.want || isFinal != tt.isFinal {
				t.Fatalf("callHistoryStatus(%q, %q) = (%q, %t), want (%q, %t)", tt.state, tt.reason, status, isFinal, tt.want, tt.isFinal)
			}
		})
	}
}

func newTestCallServer() *Server {
	return &Server{
		sessions:    NewSessionRegistry(),
		calls:       NewCallManager(),
		callTimeout: 30 * time.Second,
	}
}

func TestCallSessionBusyRulesAndCleanup(t *testing.T) {
	server := newTestCallServer()
	chat := chatPublic{
		ID:   "chat-a",
		Type: "direct",
		Members: []chatMemberPublic{
			{ID: "user-1"},
			{ID: "user-2"},
		},
	}
	if _, err := server.startCallSession(chat, "user-1", "audio", nil); err != nil {
		t.Fatalf("start call: %v", err)
	}
	otherChat := chatPublic{
		ID:   "chat-b",
		Type: "direct",
		Members: []chatMemberPublic{
			{ID: "user-2"},
			{ID: "user-3"},
		},
	}
	newSession, err := server.startCallSession(otherChat, "user-2", "audio", nil)
	if err != nil {
		t.Fatalf("start should release the caller's previous direct call and retry: %v", err)
	}
	if newSession.ChatID != otherChat.ID {
		t.Fatalf("started call in %q, want %q", newSession.ChatID, otherChat.ID)
	}
	if _, ok := server.getCallSession("chat-a"); ok {
		t.Fatalf("previous one-to-one call should be ended when caller moves to a new call")
	}
}

func TestCallStartDoesNotReleaseBusyInvitee(t *testing.T) {
	server := newTestCallServer()
	oldChat := chatPublic{ID: "old", Type: "direct", Members: []chatMemberPublic{{ID: "user-2"}, {ID: "user-3"}}}
	newChat := chatPublic{ID: "new", Type: "direct", Members: []chatMemberPublic{{ID: "user-1"}, {ID: "user-2"}}}
	oldSession, err := server.startCallSession(oldChat, "user-2", "audio", []string{"user-3"})
	if err != nil {
		t.Fatalf("start old call: %v", err)
	}

	if _, err := server.startCallSession(newChat, "user-1", "audio", []string{"user-2"}); err == nil || err.Error() != "participant is busy in another call" {
		t.Fatalf("expected invitee busy conflict, got %v", err)
	}
	if got, ok := server.getCallSession(oldChat.ID); !ok || got.ID != oldSession.ID {
		t.Fatal("the invitee's existing call must remain active")
	}
}

func TestCallStartDoesNotReleaseCallerWhenInviteeIsAlsoBusy(t *testing.T) {
	server := newTestCallServer()
	callerChat := chatPublic{ID: "caller-current", Type: "direct", Members: []chatMemberPublic{{ID: "user-1"}, {ID: "user-3"}}}
	inviteeChat := chatPublic{ID: "invitee-current", Type: "direct", Members: []chatMemberPublic{{ID: "user-2"}, {ID: "user-4"}}}
	targetChat := chatPublic{ID: "target", Type: "direct", Members: []chatMemberPublic{{ID: "user-1"}, {ID: "user-2"}}}
	callerSession, err := server.startCallSession(callerChat, "user-1", "audio", nil)
	if err != nil {
		t.Fatalf("start caller's current call: %v", err)
	}
	inviteeSession, err := server.startCallSession(inviteeChat, "user-2", "audio", nil)
	if err != nil {
		t.Fatalf("start invitee's current call: %v", err)
	}

	if _, err := server.startCallSession(targetChat, "user-1", "audio", []string{"user-2"}); err == nil || err.Error() != "participant is busy in another call" {
		t.Fatalf("expected busy invitee conflict, got %v", err)
	}
	if got, ok := server.getCallSession(callerChat.ID); !ok || got.ID != callerSession.ID {
		t.Fatal("caller’s existing call must remain active when the invitee is busy")
	}
	if got, ok := server.getCallSession(inviteeChat.ID); !ok || got.ID != inviteeSession.ID {
		t.Fatal("invitee’s existing call must remain active")
	}
}

func TestJoinReleasesPreviousOneToOneCallAndJoinsRequestedCall(t *testing.T) {
	server := newTestCallServer()
	oldChat := chatPublic{ID: "old", Type: "direct", Members: []chatMemberPublic{{ID: "user-1"}, {ID: "user-2"}}}
	targetChat := chatPublic{ID: "target", Type: "group", Members: []chatMemberPublic{{ID: "user-2"}, {ID: "user-3"}, {ID: "user-4"}}}
	if _, err := server.startCallSession(oldChat, "user-1", "audio", []string{"user-2"}); err != nil {
		t.Fatalf("start old call: %v", err)
	}
	if _, err := server.startCallSession(targetChat, "user-3", "audio", []string{"user-4"}); err != nil {
		t.Fatalf("start target call: %v", err)
	}

	joined, isNew, err := server.joinCallSession(targetChat, "user-2", "audio")
	if err != nil {
		t.Fatalf("join should release the user's previous call and retry once: %v", err)
	}
	if isNew || joined.ChatID != targetChat.ID || joined.Participants["user-2"].State != participantConnected {
		t.Fatalf("unexpected joined call result: isNew=%t session=%#v", isNew, joined)
	}
	if _, ok := server.getCallSession(oldChat.ID); ok {
		t.Fatal("previous one-to-one call should be ended")
	}
}

func TestCallStartLeavesLargerGroupWhenNonCallerMovesToAnotherCall(t *testing.T) {
	server := newTestCallServer()
	group := chatPublic{ID: "group", Type: "group", Members: []chatMemberPublic{{ID: "user-1"}, {ID: "user-2"}, {ID: "user-3"}, {ID: "user-4"}}}
	newChat := chatPublic{ID: "new", Type: "direct", Members: []chatMemberPublic{{ID: "user-2"}, {ID: "user-5"}}}
	groupSession, err := server.startCallSession(group, "user-1", "audio", []string{"user-2", "user-3", "user-4"})
	if err != nil {
		t.Fatalf("start group call: %v", err)
	}

	if _, err := server.startCallSession(newChat, "user-2", "audio", nil); err != nil {
		t.Fatalf("start should leave the user's prior group call and retry: %v", err)
	}
	remaining, ok := server.getCallSession(group.ID)
	if !ok || remaining.ID != groupSession.ID {
		t.Fatal("moving one non-caller must preserve the larger group call")
	}
	if remaining.Participants["user-2"].State != participantLeft {
		t.Fatalf("prior group participant state = %q, want left", remaining.Participants["user-2"].State)
	}
}

func TestJoinClearsStaleActiveRoomIndex(t *testing.T) {
	server := newTestCallServer()
	targetChat := chatPublic{ID: "target", Type: "direct", Members: []chatMemberPublic{{ID: "user-1"}, {ID: "user-2"}}}
	if _, err := server.startCallSession(targetChat, "user-1", "audio", []string{"user-2"}); err != nil {
		t.Fatalf("start target call: %v", err)
	}
	server.calls.Lock()
	server.calls.SetActiveLocked("user-2", "missing-room")
	server.calls.Unlock()

	joined, _, err := server.joinCallSession(targetChat, "user-2", "audio")
	if err != nil {
		t.Fatalf("join should revalidate and clear a dangling active-room index: %v", err)
	}
	if joined.Participants["user-2"].State != participantConnected {
		t.Fatalf("participant state = %q, want connected", joined.Participants["user-2"].State)
	}
}

func TestCallSessionStoresCallType(t *testing.T) {
	server := newTestCallServer()
	videoChat := chatPublic{
		ID:   "chat-video",
		Type: "direct",
		Members: []chatMemberPublic{
			{ID: "user-1"},
			{ID: "user-2"},
		},
	}
	audioChat := chatPublic{
		ID:   "chat-audio",
		Type: "direct",
		Members: []chatMemberPublic{
			{ID: "user-3"},
			{ID: "user-4"},
		},
	}

	videoSession, err := server.startCallSession(videoChat, "user-1", "video", nil)
	if err != nil {
		t.Fatalf("start video call: %v", err)
	}
	if videoSession.CallType != "video" {
		t.Fatalf("expected CallType %q, got %q", "video", videoSession.CallType)
	}
	if videoSession.ID == "" || videoSession.Topology != callTopologyMesh {
		t.Fatalf("expected room id and mesh topology")
	}

	audioSession, err := server.startCallSession(audioChat, "user-3", "audio", nil)
	if err != nil {
		t.Fatalf("start audio call: %v", err)
	}
	if audioSession.CallType != "audio" {
		t.Fatalf("expected CallType %q, got %q", "audio", audioSession.CallType)
	}
}

func TestGroupCallSessionAllowsSelectedInvitees(t *testing.T) {
	server := newTestCallServer()
	group := chatPublic{
		ID:   "group-1",
		Type: "group",
		Members: []chatMemberPublic{
			{ID: "user-1"},
			{ID: "user-2"},
			{ID: "user-3"},
			{ID: "user-4"},
		},
	}
	session, err := server.startCallSession(group, "user-1", "video", []string{"user-2", "user-3"})
	if err != nil {
		t.Fatalf("start group call: %v", err)
	}
	if len(session.Participants) != 3 {
		t.Fatalf("expected 3 participants, got %d", len(session.Participants))
	}
	if _, ok := session.Participants["user-4"]; ok {
		t.Fatal("user-4 should not be invited")
	}
}

func TestChannelCallsRejected(t *testing.T) {
	server := newTestCallServer()
	channel := chatPublic{
		ID:   "channel-1",
		Type: "channel",
		Members: []chatMemberPublic{
			{ID: "user-1"},
			{ID: "user-2"},
		},
	}
	if _, err := server.startCallSession(channel, "user-1", "audio", nil); err == nil {
		t.Fatal("expected channel calls to be rejected")
	}
}

func TestPromoteToSFUWithConfig(t *testing.T) {
	server := newTestCallServer()
	server.cfg.LiveKitURL = "ws://localhost:7880"
	server.cfg.LiveKitAPIKey = "devkey"
	server.cfg.LiveKitAPISecret = "secret"
	session := &callSession{
		ID:           "room-1",
		ChatID:       "chat-1",
		CallerUserID: "u1",
		Topology:     callTopologyMesh,
		Participants: map[string]*callParticipant{
			"u1": {UserID: "u1", Role: "host", State: participantConnecting},
			"u2": {UserID: "u2", Role: "member", State: participantConnecting},
			"u3": {UserID: "u3", Role: "member", State: participantConnecting},
			"u4": {UserID: "u4", Role: "member", State: participantConnecting},
			"u5": {UserID: "u5", Role: "member", State: participantConnecting},
		},
	}
	server.calls.Seed(session)
	promoted, err := server.promoteCallToSFU(session)
	if err != nil {
		t.Fatalf("promote: %v", err)
	}
	if !promoted || session.Topology != callTopologySFU {
		t.Fatalf("expected SFU promote, got promoted=%v topology=%s", promoted, session.Topology)
	}
}

func TestGroupCallStartsInConnectedStateAndMesh(t *testing.T) {
	server := newTestCallServer()
	group := chatPublic{
		ID:   "group-big",
		Type: "group",
		Members: []chatMemberPublic{
			{ID: "u1"}, {ID: "u2"}, {ID: "u3"}, {ID: "u4"}, {ID: "u5"}, {ID: "u6"},
		},
	}
	session, err := server.startCallSession(group, "u1", "video", []string{"u2", "u3", "u4", "u5"})
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	if session.Topology != callTopologyMesh {
		t.Fatalf("expected initial Mesh topology, got %s", session.Topology)
	}
	if session.State != callStateConnected {
		t.Fatalf("expected callStateConnected, got %s", session.State)
	}
	if host := session.Participants["u1"]; host == nil || host.State != participantConnected {
		t.Fatalf("expected host to be connected, got %v", host)
	}
	for _, inviteeID := range []string{"u2", "u3", "u4", "u5"} {
		if p := session.Participants[inviteeID]; p == nil || p.State != participantRinging {
			t.Fatalf("expected invitee %s to be ringing, got %v", inviteeID, p)
		}
	}
}

func TestEndCallForUserPreservesRingingSessionForTimeout(t *testing.T) {
	server := newTestCallServer()
	server.calls.Seed(&callSession{
		ID:           "room-a",
		ChatID:       "chat-a",
		CallerUserID: "user-1",
		CalleeUserID: "user-2",
		State:        callStateRinging,
		Participants: map[string]*callParticipant{
			"user-1": {UserID: "user-1", Role: "host", State: participantRinging},
			"user-2": {UserID: "user-2", Role: "member", State: participantRinging},
		},
	})

	if ended, ok := server.endCallForUser("user-2"); ok || ended != nil {
		t.Fatal("expected a ringing call to remain active for the normal timeout path")
	}
	if _, ok := server.getCallSession("chat-a"); !ok {
		t.Fatal("expected ringing call session to remain available")
	}
}

func TestEndCallForUserPreservesConnectedCallDuringSocketDisconnect(t *testing.T) {
	server := newTestCallServer()
	server.calls.Seed(&callSession{
		ID:           "room-a",
		ChatID:       "chat-a",
		CallerUserID: "user-1",
		CalleeUserID: "user-2",
		State:        callStateConnecting,
		Participants: map[string]*callParticipant{
			"user-1": {UserID: "user-1", Role: "host", State: participantConnecting},
			"user-2": {UserID: "user-2", Role: "member", State: participantConnecting},
		},
	})

	if ended, ok := server.endCallForUser("user-2"); ok || ended != nil {
		t.Fatal("expected a connecting call to survive a transient socket disconnect")
	}
	if _, ok := server.getCallSession("chat-a"); !ok {
		t.Fatal("expected the connected call session to remain available for reconnect")
	}
}

func TestLeaveCallKeepsRoomAlive(t *testing.T) {
	server := newTestCallServer()
	group := chatPublic{
		ID:   "group-leave",
		Type: "group",
		Members: []chatMemberPublic{
			{ID: "user-1"},
			{ID: "user-2"},
			{ID: "user-3"},
		},
	}
	session, err := server.startCallSession(group, "user-1", "audio", []string{"user-2", "user-3"})
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	server.calls.Lock()
	server.setParticipantState(session, "user-1", participantConnected)
	server.setParticipantState(session, "user-2", participantConnected)
	server.setParticipantState(session, "user-3", participantConnected)
	server.calls.Unlock()

	left, ok, ended := server.leaveCallSession(session.ChatID, "user-3")
	if !ok || ended || left == nil {
		t.Fatalf("expected leave without ending room ok=%v ended=%v", ok, ended)
	}
	if _, still := server.getCallSession(session.ChatID); !still {
		t.Fatal("room should remain for remaining participants")
	}
}

func TestResolveCallSessionLoadsFromRedis(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	server := newTestCallServer()
	server.callSessionCache = realtimecache.NewRedisCallSessionCache(rdb)

	now := time.Now().UTC()
	session := &callSession{
		ID:           "room-redis-1",
		ChatID:       "chat-redis-1",
		CallerUserID: "user-1",
		CalleeUserID: "user-2",
		CallType:     "audio",
		Topology:     callTopologyMesh,
		State:        callStateRinging,
		Participants: map[string]*callParticipant{
			"user-1": {UserID: "user-1", Role: "host", State: participantRinging},
			"user-2": {UserID: "user-2", Role: "member", State: participantRinging},
		},
		CreatedAt: now,
		ExpiresAt: now.Add(30 * time.Second),
	}
	server.persistCallSession(context.Background(), session, time.Minute)

	server.calls.Reset()

	got, ok := server.resolveCallSession("chat-redis-1", "room-redis-1")
	if !ok || got == nil {
		t.Fatal("expected resolveCallSession to hydrate from Redis after memory miss")
	}
	if got.ID != session.ID || got.ChatID != session.ChatID || got.State != callStateRinging {
		t.Fatalf("unexpected session after Redis hydrate: id=%q chat=%q state=%q", got.ID, got.ChatID, got.State)
	}
	inRoom, inChat := server.calls.Has(session)
	if !inRoom || !inChat {
		t.Fatal("expected hydrated session to be re-indexed into local maps")
	}
}

func TestVoiceChannelCallLifecycle(t *testing.T) {
	server := newTestCallServer()
	voiceChat := chatPublic{
		ID:   "voice-1",
		Type: "voice",
		Members: []chatMemberPublic{
			{ID: "user-1"},
			{ID: "user-2"},
			{ID: "user-3"},
		},
	}

	// 1. User 1 starts voice channel
	session, err := server.startCallSession(voiceChat, "user-1", "audio", nil)
	if err != nil {
		t.Fatalf("start voice channel: %v", err)
	}
	if session.Topology != callTopologySFU {
		t.Fatalf("expected SFU topology for voice channel, got %s", session.Topology)
	}
	if session.State != callStateConnected {
		t.Fatalf("expected connected state, got %s", session.State)
	}
	if len(session.Participants) != 1 {
		t.Fatalf("expected only 1 participant on initial start (no ringing invitees), got %d", len(session.Participants))
	}
	if session.Participants["user-1"].State != participantConnected {
		t.Fatalf("expected user-1 connected, got %s", session.Participants["user-1"].State)
	}

	// 2. User 2 joins voice channel
	joinedSession, isNew, err := server.joinCallSession(voiceChat, "user-2", "audio")
	if err != nil {
		t.Fatalf("join voice channel: %v", err)
	}
	if isNew {
		t.Fatal("expected existing session, not new")
	}
	if len(joinedSession.Participants) != 2 {
		t.Fatalf("expected 2 participants, got %d", len(joinedSession.Participants))
	}
	if joinedSession.Participants["user-2"].State != participantConnected {
		t.Fatalf("expected user-2 connected, got %s", joinedSession.Participants["user-2"].State)
	}

	// 3. User 1 leaves voice channel -> Room stays active
	leftSess, leftOk, ended := server.leaveCallSession(voiceChat.ID, "user-1")
	if !leftOk || ended {
		t.Fatalf("expected room to stay active when 1 participant remains, ended=%v", ended)
	}
	if leftSess.Participants["user-1"].State != participantLeft {
		t.Fatalf("expected user-1 left")
	}

	// 4. User 2 leaves voice channel -> Room ends
	_, leftOk2, ended2 := server.leaveCallSession(voiceChat.ID, "user-2")
	if !leftOk2 || !ended2 {
		t.Fatalf("expected room to end when last participant leaves, ended=%v", ended2)
	}
	if _, exists := server.getCallSession(voiceChat.ID); exists {
		t.Fatal("expected call session to be cleaned up after all participants left")
	}
}
