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
