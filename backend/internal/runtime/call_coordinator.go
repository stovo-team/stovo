package runtime

// CallCoordinator owns atomic process-local call-session transitions. It is
// deliberately generic: the runtime knows only how a session is indexed, not
// its transport, persistence, or media-engine representation.
//
// Callers provide all session-specific policy through callbacks. This keeps
// application-private session structs out of runtime while preventing callers
// from reimplementing lock/index ordering for every call transition.
type CallCoordinator[T any] struct {
	index *CallIndex[T]
}

// NewCallCoordinator constructs a coordinator for one runtime session shape.
func NewCallCoordinator[T any](identity func(T) (roomID, chatID string), activeUsers func(T) []string) *CallCoordinator[T] {
	return &CallCoordinator[T]{index: NewCallIndex(identity, activeUsers)}
}

// Begin checks live-call conflicts and indexes the session as one atomic
// transition. build is invoked only after the conflict check succeeds.
func (c *CallCoordinator[T]) Begin(chatID, initiatorID string, participantIDs []string, chatOf func(T) string, build func() T) (T, *CallConflict) {
	c.index.Lock()
	defer c.index.Unlock()
	if conflict := c.index.DetectCallConflictLocked(chatID, initiatorID, participantIDs, chatOf); conflict != nil {
		var zero T
		return zero, conflict
	}
	session := build()
	c.index.IndexLocked(session)
	return session, nil
}

// UpdateByChat applies a session mutation atomically and refreshes all indexes
// from the resulting session. Returning remove removes it from the live index.
func (c *CallCoordinator[T]) UpdateByChat(chatID string, update func(T) (remove bool)) (T, bool, bool) {
	c.index.Lock()
	defer c.index.Unlock()
	session, ok := c.index.ByChatLocked(chatID)
	if !ok {
		var zero T
		return zero, false, false
	}
	c.index.UnindexLocked(session)
	remove := update(session)
	if !remove {
		c.index.IndexLocked(session)
	}
	return session, true, remove
}

// RemoveByChat removes and returns a live session atomically.
func (c *CallCoordinator[T]) RemoveByChat(chatID string) (T, bool) {
	c.index.Lock()
	defer c.index.Unlock()
	session, ok := c.index.ByChatLocked(chatID)
	if ok {
		c.index.UnindexLocked(session)
	}
	return session, ok
}

// Lookup returns a live session by either stable room or chat key.
func (c *CallCoordinator[T]) Lookup(chatID, roomID string) (T, bool) {
	c.index.Lock()
	defer c.index.Unlock()
	if roomID != "" {
		if session, ok := c.index.ByRoomLocked(roomID); ok {
			return session, true
		}
	}
	if chatID != "" {
		return c.index.ByChatLocked(chatID)
	}
	var zero T
	return zero, false
}

// Seed indexes a recovered session through the same runtime owner.
func (c *CallCoordinator[T]) Seed(session T) { c.index.Seed(session) }

// Index exposes the underlying index only for compatibility during the
// incremental migration. New call code should use Begin, UpdateByChat,
// RemoveByChat, and Lookup instead.
func (c *CallCoordinator[T]) Index() *CallIndex[T] { return c.index }

// The methods below are transitional delegates for existing adapters. They
// keep the migration behavior-stable while call paths are converted to the
// higher-level transition methods above.
func (c *CallCoordinator[T]) Lock()                            { c.index.Lock() }
func (c *CallCoordinator[T]) Unlock()                          { c.index.Unlock() }
func (c *CallCoordinator[T]) ByChatLocked(id string) (T, bool) { return c.index.ByChatLocked(id) }
func (c *CallCoordinator[T]) ByRoomLocked(id string) (T, bool) { return c.index.ByRoomLocked(id) }
func (c *CallCoordinator[T]) ActiveRoomLocked(id string) (string, bool) {
	return c.index.ActiveRoomLocked(id)
}
func (c *CallCoordinator[T]) SetActiveLocked(userID, roomID string) {
	c.index.SetActiveLocked(userID, roomID)
}
func (c *CallCoordinator[T]) ClearActiveLocked(userID string) { c.index.ClearActiveLocked(userID) }
func (c *CallCoordinator[T]) IndexLocked(session T)           { c.index.IndexLocked(session) }
func (c *CallCoordinator[T]) UnindexLocked(session T)         { c.index.UnindexLocked(session) }
func (c *CallCoordinator[T]) DetectCallConflictLocked(chatID, initiatorID string, participantIDs []string, chatOf func(T) string) *CallConflict {
	return c.index.DetectCallConflictLocked(chatID, initiatorID, participantIDs, chatOf)
}
func (c *CallCoordinator[T]) Has(session T) (bool, bool) { return c.index.Has(session) }
func (c *CallCoordinator[T]) Reset()                     { c.index.Reset() }
