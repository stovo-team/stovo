package runtime

import (
	"context"
	"encoding/json"
	"time"
)

// CallSessionCache stores opaque runtime snapshots. The call transport owns
// snapshot serialization; Redis remains an infrastructure adapter.
type CallSessionCache interface {
	Save(context.Context, string, []byte, time.Duration) error
	Load(context.Context, string) ([]byte, bool, error)
	Delete(context.Context, string) error
}

// CallSessionSnapshots owns the cache mechanics for opaque live-call
// snapshots. The caller supplies only the session shape and its stable keys;
// this keeps Redis keying, JSON serialization, and dual room/chat storage out
// of a transport or compatibility host.
type CallSessionSnapshots[T any] struct {
	Cache   CallSessionCache
	Key     func(string) string
	OnError func(operation string, err error)
}

func (s CallSessionSnapshots[T]) Save(ctx context.Context, value T, roomID, chatID string, ttl time.Duration) {
	if s.Cache == nil || roomID == "" {
		return
	}
	data, err := json.Marshal(value)
	if err != nil {
		s.report("marshal", err)
		return
	}
	if err := s.Cache.Save(ctx, s.key(roomID), data, ttl); err != nil {
		s.report("save", err)
	}
	if chatID != "" && chatID != roomID {
		if err := s.Cache.Save(ctx, s.key(chatID), data, ttl); err != nil {
			s.report("save", err)
		}
	}
}

func (s CallSessionSnapshots[T]) Load(ctx context.Context, id string) (T, bool) {
	var zero T
	if s.Cache == nil || id == "" {
		return zero, false
	}
	data, found, err := s.Cache.Load(ctx, s.key(id))
	if err != nil {
		s.report("load", err)
		return zero, false
	}
	if !found {
		return zero, false
	}
	var value T
	if err := json.Unmarshal(data, &value); err != nil {
		s.report("unmarshal", err)
		return zero, false
	}
	return value, true
}

func (s CallSessionSnapshots[T]) Delete(ctx context.Context, id string) {
	if s.Cache == nil || id == "" {
		return
	}
	if err := s.Cache.Delete(ctx, s.key(id)); err != nil {
		s.report("delete", err)
	}
}

func (s CallSessionSnapshots[T]) key(id string) string {
	if s.Key != nil {
		return s.Key(id)
	}
	return id
}

func (s CallSessionSnapshots[T]) report(operation string, err error) {
	if err != nil && s.OnError != nil {
		s.OnError(operation, err)
	}
}
