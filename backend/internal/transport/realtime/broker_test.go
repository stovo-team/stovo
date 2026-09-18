package realtime

import (
	"reflect"
	"testing"

	"stovo-messenger/backend/internal/ports"
)

func TestMessageBrokerHandlerPreservesFanoutContracts(t *testing.T) {
	type emission struct {
		userID, event string
		payload       any
	}
	emissions := make([]emission, 0)
	handler := NewMessageBrokerHandler(MessageBrokerDependencies{
		Members: func(chatID string) ([]string, error) {
			if chatID != "chat-1" {
				t.Fatalf("chatID = %q", chatID)
			}
			return []string{"sender", "reader"}, nil
		},
		Online: func(userID string) bool { return userID == "reader" },
		Emit: func(userID, event string, payload any) error {
			emissions = append(emissions, emission{userID, event, payload})
			return nil
		},
		Seen: func(string) bool { return false },
	})
	event := ports.Event{"type": "message.created", "event_id": "event-1", "payload": map[string]any{"id": "message-1", "chatId": "chat-1", "senderId": "sender", "content": "hello"}}
	if err := handler(event); err != nil {
		t.Fatal(err)
	}
	if got, want := []string{emissions[0].userID + ":" + emissions[0].event, emissions[1].userID + ":" + emissions[1].event, emissions[2].userID + ":" + emissions[2].event, emissions[3].userID + ":" + emissions[3].event}, []string{"sender:message:new", "reader:message:new", "sender:message:delivered", "reader:message:delivered"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("emissions = %#v, want %#v", got, want)
	}
	if got, want := emissions[2].payload, map[string]any{"messageId": "message-1", "chatId": "chat-1", "userIds": []string{"reader"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("delivery payload = %#v, want %#v", got, want)
	}
}

func TestMessageBrokerHandlerDeduplicatesBeforePayloadDecode(t *testing.T) {
	called := false
	handler := NewMessageBrokerHandler(MessageBrokerDependencies{Seen: func(string) bool { return true }, Members: func(string) ([]string, error) { called = true; return nil, nil }})
	if err := handler(ports.Event{"type": "message.created", "event_id": "duplicate", "payload": make(chan int)}); err != nil {
		t.Fatal(err)
	}
	if called {
		t.Fatal("membership lookup for duplicate")
	}
}

func TestMessageBrokerHandlerCrossNodeEvents(t *testing.T) {
	type emission struct {
		userID, event string
		payload       any
	}
	emissions := make([]emission, 0)
	handler := NewMessageBrokerHandler(MessageBrokerDependencies{
		Members: func(chatID string) ([]string, error) {
			return []string{"user-1", "user-2"}, nil
		},
		Emit: func(userID, event string, payload any) error {
			emissions = append(emissions, emission{userID, event, payload})
			return nil
		},
		Seen: func(string) bool { return false },
	})

	// typing.update: excludes the sender "user-1", so only "user-2" receives it
	if err := handler(ports.Event{
		"type":      "typing.update",
		"event_id":  "typing-1",
		"chat_id":   "chat-1",
		"sender_id": "user-1",
		"payload":   map[string]any{"chatId": "chat-1", "isTyping": true},
	}); err != nil {
		t.Fatal(err)
	}
	if len(emissions) != 1 || emissions[0].userID != "user-2" || emissions[0].event != "typing:update" {
		t.Fatalf("unexpected typing emission: %#v", emissions)
	}

	// message.read: delivered to all members
	emissions = nil
	if err := handler(ports.Event{
		"type":     "message.read",
		"event_id": "read-1",
		"chat_id":  "chat-1",
		"payload":  map[string]any{"messageId": "msg-1"},
	}); err != nil {
		t.Fatal(err)
	}
	if len(emissions) != 2 || emissions[0].event != "message:read" {
		t.Fatalf("unexpected read emission: %#v", emissions)
	}

	// call.user: delivered to target user
	emissions = nil
	if err := handler(ports.Event{
		"type":       "call.user",
		"event_id":   "call-1",
		"user_id":    "user-2",
		"event_name": "call:ringing",
		"payload":    map[string]any{"chatId": "chat-1"},
	}); err != nil {
		t.Fatal(err)
	}
	if len(emissions) != 1 || emissions[0].userID != "user-2" || emissions[0].event != "call:ringing" {
		t.Fatalf("unexpected call emission: %#v", emissions)
	}
}

