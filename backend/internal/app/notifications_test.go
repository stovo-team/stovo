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
