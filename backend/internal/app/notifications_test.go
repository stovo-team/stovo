package app

import (
	"testing"

	"github.com/doquangtan/socketio/v4"
)

func TestUserViewingChatInForeground(t *testing.T) {
	server := &Server{sessions: NewSessionRegistry()}
	user := userPublic{ID: "user-1"}
	foregroundSocket := &socketio.Socket{Id: "foreground-chat-a"}
	backgroundSocket := &socketio.Socket{Id: "background-chat-b"}
	server.sessions.Register(user, foregroundSocket)
	server.sessions.Register(user, backgroundSocket)
	server.sessions.SetAppState(foregroundSocket.Id, true, "chat-a")
	server.sessions.SetAppState(backgroundSocket.Id, false, "chat-b")

	if !server.sessions.IsViewingChatInForeground("user-1", "chat-a") {
		t.Fatal("expected notifications for the active foreground chat to be suppressed")
	}
	if server.sessions.IsViewingChatInForeground("user-1", "chat-b") {
		t.Fatal("expected notifications for another chat to be delivered")
	}
}

func TestFormatMessageNotificationDirect(t *testing.T) {
	title, message, tags := formatMessageNotification("direct", nil, "Alice", "hello")
	if title != "Alice" {
		t.Fatalf("expected title Alice, got %q", title)
	}
	if message != "hello" {
		t.Fatalf("expected message hello, got %q", message)
	}
	if !containsTag(tags, "direct") || !containsTag(tags, "speech_balloon") {
		t.Fatalf("expected direct + speech_balloon tags, got %v", tags)
	}
}

func TestFormatMessageNotificationGroup(t *testing.T) {
	chatTitle := "Family Chat"
	title, message, tags := formatMessageNotification("group", &chatTitle, "Alice", "hello")
	if title != "Family Chat" {
		t.Fatalf("expected chat title, got %q", title)
	}
	if message != "Alice: hello" {
		t.Fatalf("expected sender-prefixed body, got %q", message)
	}
	if containsTag(tags, "direct") {
		t.Fatalf("did not expect direct tag, got %v", tags)
	}
}

func TestFormatMessageNotificationMissingTitle(t *testing.T) {
	title, _, _ := formatMessageNotification("channel", nil, "Bob", "hi")
	if title != "Chat" {
		t.Fatalf("expected fallback Chat title, got %q", title)
	}
}

func TestExtractMentionedUserIDsFromContent(t *testing.T) {
	members := []chatMemberPublic{
		{ID: "user-1", Username: "alice", DisplayName: "Alice Smith"},
		{ID: "user-2", Username: "bobjones", DisplayName: "Bob Jones"},
		{ID: "user-3", Username: "charlie", DisplayName: "Charlie Brown"},
	}

	// Mention by username
	m1 := extractMentionedUserIDsFromContent(members, "user-1", "Hey @bobjones check this out")
	if len(m1) != 1 || m1[0] != "user-2" {
		t.Fatalf("expected user-2 for username mention, got %v", m1)
	}

	// Mention by display name
	m2 := extractMentionedUserIDsFromContent(members, "user-1", "Hello @Charlie Brown please look")
	if len(m2) != 1 || m2[0] != "user-3" {
		t.Fatalf("expected user-3 for display name mention, got %v", m2)
	}

	// Sender self-mention ignored
	m3 := extractMentionedUserIDsFromContent(members, "user-1", "I am @alice")
	if len(m3) != 0 {
		t.Fatalf("expected empty for self-mention, got %v", m3)
	}
}

func containsTag(tags []string, want string) bool {
	for _, tag := range tags {
		if tag == want {
			return true
		}
	}
	return false
}
