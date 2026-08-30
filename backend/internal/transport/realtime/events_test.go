package realtime

import (
	"context"
	"testing"

	socketio "github.com/doquangtan/socketio/v4"
)

func TestCoreEventNamesPreserveInboundSocketContract(t *testing.T) {
	want := []string{
		"disconnect", "health:ping", "app:state", "message:send",
		"message:read", "typing:start", "typing:stop",
	}
	if len(CoreEventNames) != len(want) {
		t.Fatalf("CoreEventNames length = %d, want %d", len(CoreEventNames), len(want))
	}
	for i := range want {
		if CoreEventNames[i] != want[i] {
			t.Fatalf("CoreEventNames[%d] = %q, want %q", i, CoreEventNames[i], want[i])
		}
	}
}

func TestCallEventNamesPreserveInboundSocketContract(t *testing.T) {
	want := []CallEvent{
		"call:start", "call:join", "call:invite", "call:accept", "call:decline",
		"call:cancel", "call:leave", "call:end", "call:signal",
	}
	if len(CallEventNames) != len(want) {
		t.Fatalf("CallEventNames length = %d, want %d", len(CallEventNames), len(want))
	}
	for i := range want {
		if CallEventNames[i] != want[i] {
			t.Fatalf("CallEventNames[%d] = %q, want %q", i, CallEventNames[i], want[i])
		}
	}
}

func TestCallbackCallCoordinatorDispatchesOnlyMatchingEvent(t *testing.T) {
	var started, joined int
	coordinator := CallbackCallCoordinator{
		Start: func(*socketio.EventPayload) { started++ },
		Join:  func(*socketio.EventPayload) { joined++ },
	}
	coordinator.HandleCallEvent(context.Background(), CallActor{UserID: "user", SocketID: "socket"}, CallStart, &socketio.EventPayload{})
	if started != 1 || joined != 0 {
		t.Fatalf("dispatch counts = start:%d join:%d, want start:1 join:0", started, joined)
	}
	// A missing optional callback must not panic or invoke another event.
	coordinator.HandleCallEvent(context.Background(), CallActor{}, CallEnd, &socketio.EventPayload{})
	if started != 1 || joined != 0 {
		t.Fatalf("unexpected dispatch after missing callback = start:%d join:%d", started, joined)
	}
}
