package runtime

import "sync"

// CallConflictKind identifies the invariant that prevents a live-call
// transition. It deliberately contains no transport or persistence concepts,
// so callers can map it to their own protocol errors.
type CallConflictKind string

const (
	CallConflictChat        CallConflictKind = "chat_busy"
	CallConflictInitiator   CallConflictKind = "initiator_busy"
	CallConflictParticipant CallConflictKind = "participant_busy"
)

// CallConflict is returned by DetectCallConflictLocked when starting a call
// would violate the process-local live-session invariants.
type CallConflict struct {
	Kind   CallConflictKind
	UserID string
}

// CallIndex owns the process-local indexes for live call sessions. It is a
// runtime concern: callers provide their session shape and the index keeps no
// transport, persistence, or media-engine types.
//
// Mutations to the session and calls to the Locked methods must happen while
// the index lock is held, so the room, chat, and participant indexes remain
// consistent as one transition.
type CallIndex[T any] struct {
	mu           sync.Mutex
	byChat       map[string]T
	byRoom       map[string]T
	activeByUser map[string]string
	identity     func(T) (roomID, chatID string)
	activeUsers  func(T) []string
}

// NewCallIndex creates an empty index. identity and activeUsers must be pure
// readers of the supplied session; they are invoked while the index is locked.
func NewCallIndex[T any](identity func(T) (roomID, chatID string), activeUsers func(T) []string) *CallIndex[T] {
	return &CallIndex[T]{byChat: make(map[string]T), byRoom: make(map[string]T), activeByUser: make(map[string]string), identity: identity, activeUsers: activeUsers}
}

func (m *CallIndex[T]) Lock()   { m.mu.Lock() }
func (m *CallIndex[T]) Unlock() { m.mu.Unlock() }

func (m *CallIndex[T]) ByChatLocked(chatID string) (T, bool) {
	session, ok := m.byChat[chatID]
	return session, ok
}
func (m *CallIndex[T]) ByRoomLocked(roomID string) (T, bool) {
	session, ok := m.byRoom[roomID]
	return session, ok
}
func (m *CallIndex[T]) ActiveRoomLocked(userID string) (string, bool) {
	roomID, ok := m.activeByUser[userID]
	return roomID, ok
}
func (m *CallIndex[T]) SetActiveLocked(userID, roomID string) { m.activeByUser[userID] = roomID }
func (m *CallIndex[T]) ClearActiveLocked(userID string)       { delete(m.activeByUser, userID) }

func (m *CallIndex[T]) IndexLocked(session T) {
	roomID, chatID := m.identity(session)
	m.byRoom[roomID], m.byChat[chatID] = session, session
	for _, userID := range m.activeUsers(session) {
		m.activeByUser[userID] = roomID
	}
}

func (m *CallIndex[T]) UnindexLocked(session T) {
	roomID, chatID := m.identity(session)
	delete(m.byRoom, roomID)
	delete(m.byChat, chatID)
	for _, userID := range m.activeUsers(session) {
		if m.activeByUser[userID] == roomID {
			delete(m.activeByUser, userID)
		}
	}
}

func (m *CallIndex[T]) CountLocked() int { return len(m.byRoom) }

// DetectCallConflictLocked checks whether a proposed call can share the live
// index. The caller must hold m's lock for the entire surrounding transition.
// A user already indexed in the same chat is allowed; this preserves joins and
// retries while preventing a user from being active in a second chat.
func (m *CallIndex[T]) DetectCallConflictLocked(chatID, initiatorID string, participantIDs []string, chatOf func(T) string) *CallConflict {
	if _, exists := m.ByChatLocked(chatID); exists {
		return &CallConflict{Kind: CallConflictChat}
	}
	if m.userBusyInAnotherChatLocked(initiatorID, chatID, chatOf) {
		return &CallConflict{Kind: CallConflictInitiator, UserID: initiatorID}
	}
	for _, userID := range participantIDs {
		if m.userBusyInAnotherChatLocked(userID, chatID, chatOf) {
			return &CallConflict{Kind: CallConflictParticipant, UserID: userID}
		}
	}
	return nil
}

func (m *CallIndex[T]) userBusyInAnotherChatLocked(userID, chatID string, chatOf func(T) string) bool {
	roomID, busy := m.ActiveRoomLocked(userID)
	if !busy {
		return false
	}
	session, found := m.ByRoomLocked(roomID)
	return found && chatOf(session) != chatID
}

// Seed adds a restored session while preserving the same index invariants as
// normal runtime transitions.
func (m *CallIndex[T]) Seed(session T) {
	m.Lock()
	defer m.Unlock()
	m.IndexLocked(session)
}

// Has reports whether a session is currently indexed by both stable keys.
// It is primarily useful for runtime recovery checks and focused tests.
func (m *CallIndex[T]) Has(session T) (byRoom, byChat bool) {
	m.Lock()
	defer m.Unlock()
	roomID, chatID := m.identity(session)
	_, byRoom = m.byRoom[roomID]
	_, byChat = m.byChat[chatID]
	return byRoom, byChat
}

// Reset discards only the process-local runtime state.
func (m *CallIndex[T]) Reset() {
	m.Lock()
	defer m.Unlock()
	m.byChat, m.byRoom, m.activeByUser = make(map[string]T), make(map[string]T), make(map[string]string)
}
