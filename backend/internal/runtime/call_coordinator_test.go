package runtime

import "testing"

type coordinatorSession struct {
	room, chat string
	users      []string
}

func TestCallCoordinatorOwnsBeginUpdateAndRemoval(t *testing.T) {
	c := NewCallCoordinator(func(s *coordinatorSession) (string, string) { return s.room, s.chat }, func(s *coordinatorSession) []string { return s.users })
	s, conflict := c.Begin("chat-a", "u1", []string{"u2"}, func(s *coordinatorSession) string { return s.chat }, func() *coordinatorSession {
		return &coordinatorSession{room: "room-a", chat: "chat-a", users: []string{"u1", "u2"}}
	})
	if conflict != nil || s == nil {
		t.Fatalf("Begin() = (%v, %v), want session without conflict", s, conflict)
	}
	_, conflict = c.Begin("chat-a", "u3", nil, func(s *coordinatorSession) string { return s.chat }, func() *coordinatorSession { return nil })
	if conflict == nil || conflict.Kind != CallConflictChat {
		t.Fatalf("duplicate Begin conflict = %#v", conflict)
	}
	updated, ok, removed := c.UpdateByChat("chat-a", func(s *coordinatorSession) bool { s.users = []string{"u1"}; return false })
	if !ok || removed || len(updated.users) != 1 {
		t.Fatalf("UpdateByChat() = (%#v, %v, %v)", updated, ok, removed)
	}
	removedSession, ok := c.RemoveByChat("chat-a")
	if !ok || removedSession != s {
		t.Fatal("RemoveByChat did not return the indexed session")
	}
	if _, ok := c.Lookup("chat-a", ""); ok {
		t.Fatal("removed session remained indexed")
	}
}
