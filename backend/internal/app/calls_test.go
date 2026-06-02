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
	if _, err := server.startCallSession(chat, "user-1"); err != nil {
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
	if _, err := server.startCallSession(otherChat, "user-2"); err == nil {
		t.Fatalf("expected busy conflict")
	}
	if _, ok := server.endCallSession("chat-a"); !ok {
		t.Fatalf("expected call cleanup")
	}
	if _, err := server.startCallSession(otherChat, "user-2"); err != nil {
		t.Fatalf("start after cleanup: %v", err)
	}
}
