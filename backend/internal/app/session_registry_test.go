package app

import (
	"testing"

	socketio "github.com/doquangtan/socketio/v4"
)

func TestSessionRegistryTracksUserSessions(t *testing.T) {
	registry := NewSessionRegistry()
	user := userPublic{ID: "user-1"}
	first := &socketio.Socket{Id: "socket-1"}
	second := &socketio.Socket{Id: "socket-2"}

	registry.Register(user, first)
	registry.Register(user, second)
	if !registry.IsOnline(user.ID) {
		t.Fatal("expected user to be online after registration")
	}
	if got := registry.SocketsForUser(user.ID); len(got) != 2 {
		t.Fatalf("expected two socket snapshots, got %d", len(got))
	}

	registry.Unregister(user.ID, first.Id)
	if got := registry.SocketsForUser(user.ID); len(got) != 1 {
		t.Fatalf("expected one socket after unregistering the first, got %d", len(got))
	}
	registry.Unregister(user.ID, second.Id)
	if registry.IsOnline(user.ID) {
		t.Fatal("expected user to be offline after unregistering every socket")
	}
}

func TestSessionRegistryForegroundChatState(t *testing.T) {
	registry := NewSessionRegistry()
	user := userPublic{ID: "user-1"}
	socket := &socketio.Socket{Id: "socket-1"}
	registry.Register(user, socket)

	registry.SetAppState(socket.Id, true, "chat-1")
	if !registry.IsViewingChatInForeground(user.ID, "chat-1") {
		t.Fatal("expected foreground active chat to be tracked")
	}
	registry.SetAppState(socket.Id, false, "chat-1")
	if registry.IsViewingChatInForeground(user.ID, "chat-1") {
		t.Fatal("expected background session not to suppress notifications")
	}
}
