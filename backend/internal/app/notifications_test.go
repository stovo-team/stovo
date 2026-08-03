package app

import (
	"testing"

	"github.com/doquangtan/socketio/v4"
)

func TestUserViewingChatInForeground(t *testing.T) {
	server := &Server{
		socketUsers: map[string]socketSession{
			"foreground-chat-a": {Foreground: true, ActiveChatID: "chat-a"},
			"background-chat-b": {Foreground: false, ActiveChatID: "chat-b"},
		},
		userSockets: map[string]map[string]*socketio.Socket{
			"user-1": {
				"foreground-chat-a": nil,
				"background-chat-b": nil,
			},
		},
	}

	if !server.userViewingChatInForeground("user-1", "chat-a") {
		t.Fatal("expected notifications for the active foreground chat to be suppressed")
	}
	if server.userViewingChatInForeground("user-1", "chat-b") {
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

func containsTag(tags []string, want string) bool {
	for _, tag := range tags {
		if tag == want {
			return true
		}
	}
	return false
}
