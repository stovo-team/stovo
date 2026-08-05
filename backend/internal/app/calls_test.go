package app

import (
	"context"
	"testing"
	"time"

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
		callByChat:     make(map[string]*callSession),
		callByRoom:     make(map[string]*callSession),
		userActiveCall: make(map[string]string),
		callTimeout:    30 * time.Second,
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
	if _, err := server.startCallSession(otherChat, "user-2", "audio", nil); err == nil {
		t.Fatalf("expected busy conflict")
	}
	if _, ok := server.endCallSession("chat-a"); !ok {
		t.Fatalf("expected call cleanup")
	}
	if _, err := server.startCallSession(otherChat, "user-2", "audio", nil); err != nil {
		t.Fatalf("start after cleanup: %v", err)
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
	server.callByRoom[session.ID] = session
	server.callByChat[session.ChatID] = session
	promoted, err := server.promoteCallToSFU(session)
	if err != nil {
		t.Fatalf("promote: %v", err)
	}
	if !promoted || session.Topology != callTopologySFU {
		t.Fatalf("expected SFU promote, got promoted=%v topology=%s", promoted, session.Topology)
	}
}

func TestStartWithMoreThanFourUsesSFU(t *testing.T) {
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
	if session.Topology != callTopologySFU {
		t.Fatalf("expected SFU for 5 participants, got %s", session.Topology)
	}
}

func TestEndCallForUserPreservesRingingSessionForTimeout(t *testing.T) {
	server := &Server{
		callByChat: map[string]*callSession{},
		callByRoom: map[string]*callSession{
			"room-a": {
				ID:           "room-a",
				ChatID:       "chat-a",
				CallerUserID: "user-1",
				CalleeUserID: "user-2",
				State:        callStateRinging,
				Participants: map[string]*callParticipant{
					"user-1": {UserID: "user-1", Role: "host", State: participantRinging},
					"user-2": {UserID: "user-2", Role: "member", State: participantRinging},
				},
			},
		},
		userActiveCall: map[string]string{
			"user-1": "room-a",
			"user-2": "room-a",
		},
	}
	server.callByChat["chat-a"] = server.callByRoom["room-a"]

	if ended, ok := server.endCallForUser("user-2"); ok || ended != nil {
		t.Fatal("expected a ringing call to remain active for the normal timeout path")
	}
	if _, ok := server.getCallSession("chat-a"); !ok {
		t.Fatal("expected ringing call session to remain available")
	}
}

func TestEndCallForUserPreservesConnectedCallDuringSocketDisconnect(t *testing.T) {
	server := &Server{
		callByChat: map[string]*callSession{},
		callByRoom: map[string]*callSession{
			"room-a": {
				ID:           "room-a",
				ChatID:       "chat-a",
				CallerUserID: "user-1",
				CalleeUserID: "user-2",
				State:        callStateConnecting,
				Participants: map[string]*callParticipant{
					"user-1": {UserID: "user-1", Role: "host", State: participantConnecting},
					"user-2": {UserID: "user-2", Role: "member", State: participantConnecting},
				},
			},
		},
		userActiveCall: map[string]string{
			"user-1": "room-a",
			"user-2": "room-a",
		},
	}
	server.callByChat["chat-a"] = server.callByRoom["room-a"]

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
	server.callMu.Lock()
	server.setParticipantState(session, "user-1", participantConnected)
	server.setParticipantState(session, "user-2", participantConnected)
	server.setParticipantState(session, "user-3", participantConnected)
	server.callMu.Unlock()

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
	server.redis = rdb

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

	server.callMu.Lock()
	server.callByRoom = make(map[string]*callSession)
	server.callByChat = make(map[string]*callSession)
	server.userActiveCall = make(map[string]string)
	server.callMu.Unlock()

	got, ok := server.resolveCallSession("chat-redis-1", "room-redis-1")
	if !ok || got == nil {
		t.Fatal("expected resolveCallSession to hydrate from Redis after memory miss")
	}
	if got.ID != session.ID || got.ChatID != session.ChatID || got.State != callStateRinging {
		t.Fatalf("unexpected session after Redis hydrate: id=%q chat=%q state=%q", got.ID, got.ChatID, got.State)
	}
	server.callMu.Lock()
	_, inRoom := server.callByRoom[session.ID]
	_, inChat := server.callByChat[session.ChatID]
	server.callMu.Unlock()
	if !inRoom || !inChat {
		t.Fatal("expected hydrated session to be re-indexed into local maps")
	}
}
