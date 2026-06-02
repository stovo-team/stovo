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
	chats := []chatPublic{
		{
			ID:   "chat-audio",
			Type: "direct",
			Members: []chatMemberPublic{{ID: "user-1"}, {ID: "user-2"}},
		},
		{
			ID:   "chat-video",
			Type: "direct",
			Members: []chatMemberPublic{{ID: "user-3"}, {ID: "user-4"}},
		},
	}
	sess, err := server.startCallSession(chats[0], chats[0].Members[0].ID, "audio")
	if err != nil {
		t.Fatalf("start audio call: %v", err)
	}
	if sess.CallType != "audio" {
		t.Fatalf("expected CallType %q, got %q", "audio", sess.CallType)
	}
	sess2, err := server.startCallSession(chats[1], chats[1].Members[0].ID, "video")
	if err != nil {
		t.Fatalf("start video call: %v", err)
	}
	if sess2.CallType != "video" {
		t.Fatalf("expected CallType %q, got %q", "video", sess2.CallType)
	}

	// Verify sanitization: empty and invalid values default to "audio"
	fallbackServer := &Server{
		callByChat:     make(map[string]*callSession),
		userActiveCall: make(map[string]string),
	}
	fallbackChats := []chatPublic{
		{
			ID:   "chat-empty",
			Type: "direct",
			Members: []chatMemberPublic{{ID: "user-5"}, {ID: "user-6"}},
		},
		{
			ID:   "chat-invalid",
			Type: "direct",
			Members: []chatMemberPublic{{ID: "user-7"}, {ID: "user-8"}},
		},
	}
	for _, tc := range []struct {
		chat     chatPublic
		callType string
	}{
		{fallbackChats[0], ""},
		{fallbackChats[1], "screen"},
	} {
		sess, err := fallbackServer.startCallSession(tc.chat, tc.chat.Members[0].ID, tc.callType)
		if err != nil {
			t.Fatalf("start call with callType %q: %v", tc.callType, err)
		}
		if sess.CallType != "audio" {
			t.Fatalf("expected CallType %q for input %q, got %q", "audio", tc.callType, sess.CallType)
		}
	}
}
