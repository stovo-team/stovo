package app

import "testing"

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
