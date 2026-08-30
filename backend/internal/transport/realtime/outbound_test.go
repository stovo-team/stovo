package realtime

import (
	"reflect"
	"testing"
)

func TestOutboundPayloadsPreserveContract(t *testing.T) {
	if got, want := MessageReadPayload("c", "m", "u"), map[string]any{"messageId": "m", "chatId": "c", "userId": "u"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("MessageReadPayload() = %#v, want %#v", got, want)
	}
	if got, want := MessageDeletedPayload("c", "m"), map[string]any{"messageId": "m", "chatId": "c"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("MessageDeletedPayload() = %#v, want %#v", got, want)
	}
	if got, want := MessageUnpinnedPayload("c", "m"), map[string]any{"chatId": "c", "messageId": "m"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("MessageUnpinnedPayload() = %#v, want %#v", got, want)
	}
}

func TestEmitToUsersIsBestEffort(t *testing.T) {
	var emitted []string
	EmitToUsers(func(userID, event string, payload any) error {
		emitted = append(emitted, userID+":"+event)
		return nil
	}, []string{"a", "b"}, "message:read", nil)
	if want := []string{"a:message:read", "b:message:read"}; !reflect.DeepEqual(emitted, want) {
		t.Fatalf("emitted = %#v, want %#v", emitted, want)
	}
}
