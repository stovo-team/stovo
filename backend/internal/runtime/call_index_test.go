package runtime

import "testing"

type indexedCall struct {
	room, chat string
	users      []string
}

func TestCallIndexMaintainsAllIndexes(t *testing.T) {
	index := NewCallIndex(func(call *indexedCall) (string, string) { return call.room, call.chat }, func(call *indexedCall) []string { return call.users })
	call := &indexedCall{room: "room-1", chat: "chat-1", users: []string{"host", "member"}}
	index.Lock()
	index.IndexLocked(call)
	if got, ok := index.ByChatLocked("chat-1"); !ok || got != call {
		t.Fatal("chat index did not retain call")
	}
	if room, ok := index.ActiveRoomLocked("member"); !ok || room != "room-1" {
		t.Fatalf("active participant index = %q, %t", room, ok)
	}
	index.UnindexLocked(call)
	_, exists := index.ByRoomLocked("room-1")
	_, active := index.ActiveRoomLocked("host")
	index.Unlock()
	if exists || active {
		t.Fatal("unindex should remove room and active participant entries")
	}
}

func TestCallIndexDetectsTransitionConflicts(t *testing.T) {
	index := NewCallIndex(func(call *indexedCall) (string, string) { return call.room, call.chat }, func(call *indexedCall) []string { return call.users })
	index.Lock()
	index.IndexLocked(&indexedCall{room: "room-1", chat: "chat-1", users: []string{"host", "member"}})
	if conflict := index.DetectCallConflictLocked("chat-1", "new-host", nil, func(call *indexedCall) string { return call.chat }); conflict == nil || conflict.Kind != CallConflictChat {
		t.Fatalf("chat conflict = %#v", conflict)
	}
	if conflict := index.DetectCallConflictLocked("chat-2", "host", nil, func(call *indexedCall) string { return call.chat }); conflict == nil || conflict.Kind != CallConflictInitiator {
		t.Fatalf("initiator conflict = %#v", conflict)
	}
	if conflict := index.DetectCallConflictLocked("chat-2", "new-host", []string{"member"}, func(call *indexedCall) string { return call.chat }); conflict == nil || conflict.Kind != CallConflictParticipant || conflict.UserID != "member" {
		t.Fatalf("participant conflict = %#v", conflict)
	}
	if conflict := index.DetectCallConflictLocked("chat-2", "new-host", []string{"unoccupied"}, func(call *indexedCall) string { return call.chat }); conflict != nil {
		t.Fatalf("unexpected conflict = %#v", conflict)
	}
	index.Unlock()
}
