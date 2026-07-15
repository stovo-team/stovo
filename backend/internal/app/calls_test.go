package app

import "testing"

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

func TestCallSessionBusyRulesAndCleanup(t *testing.T) {
	server := &Server{
		callByChat:     make(map[string]*callSession),
		userActiveCall: make(map[string]string),
	}
	chat := chatPublic{
		ID:   "chat-a",
		Type: "direct",
		Members: []chatMemberPublic{
			{ID: "user-1"},
			{ID: "user-2"},
		},
	}
	if _, err := server.startCallSession(chat, "user-1", "audio"); err != nil {
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
	if _, err := server.startCallSession(otherChat, "user-2", "audio"); err == nil {
		t.Fatalf("expected busy conflict")
	}
	if _, ok := server.endCallSession("chat-a"); !ok {
		t.Fatalf("expected call cleanup")
	}
	if _, err := server.startCallSession(otherChat, "user-2", "audio"); err != nil {
		t.Fatalf("start after cleanup: %v", err)
	}
}

func TestCallSessionStoresCallType(t *testing.T) {
	server := &Server{
		callByChat:     make(map[string]*callSession),
		userActiveCall: make(map[string]string),
	}
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

	videoSession, err := server.startCallSession(videoChat, "user-1", "video")
	if err != nil {
		t.Fatalf("start video call: %v", err)
	}
	if videoSession.CallType != "video" {
		t.Fatalf("expected CallType %q, got %q", "video", videoSession.CallType)
	}

	audioSession, err := server.startCallSession(audioChat, "user-3", "audio")
	if err != nil {
		t.Fatalf("start audio call: %v", err)
	}
	if audioSession.CallType != "audio" {
		t.Fatalf("expected CallType %q, got %q", "audio", audioSession.CallType)
	}
}

func TestEndCallForUserPreservesRingingSessionForTimeout(t *testing.T) {
	server := &Server{
		callByChat: map[string]*callSession{
			"chat-a": {
				ChatID:       "chat-a",
				CallerUserID: "user-1",
				CalleeUserID: "user-2",
				State:        callStateRinging,
			},
		},
		userActiveCall: map[string]string{
			"user-1": "chat-a",
			"user-2": "chat-a",
		},
	}

	if ended, ok := server.endCallForUser("user-2"); ok || ended != nil {
		t.Fatal("expected a ringing call to remain active for the normal timeout path")
	}
	if _, ok := server.getCallSession("chat-a"); !ok {
		t.Fatal("expected ringing call session to remain available")
	}
}

func TestEndCallForUserEndsCallAfterRinging(t *testing.T) {
	server := &Server{
		callByChat: map[string]*callSession{
			"chat-a": {
				ChatID:       "chat-a",
				CallerUserID: "user-1",
				CalleeUserID: "user-2",
				State:        callStateConnecting,
			},
		},
		userActiveCall: map[string]string{
			"user-1": "chat-a",
			"user-2": "chat-a",
		},
	}

	if ended, ok := server.endCallForUser("user-2"); !ok || ended == nil {
		t.Fatal("expected a connecting call to end after its participant disconnects")
	}
}
