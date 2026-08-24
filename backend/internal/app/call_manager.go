package app

import "sync"

// CallManager owns the in-memory indexes for live call sessions. Call-session
// mutation must happen while its lock is held so the three indexes stay in sync.
type CallManager struct {
	mu           *sync.Mutex
	byChat       map[string]*callSession
	byRoom       map[string]*callSession
	activeByUser map[string]string
}

func NewCallManager() *CallManager {
	return &CallManager{
		mu:           &sync.Mutex{},
		byChat:       make(map[string]*callSession),
		byRoom:       make(map[string]*callSession),
		activeByUser: make(map[string]string),
	}
}

func (m *CallManager) Lock()   { m.mu.Lock() }
func (m *CallManager) Unlock() { m.mu.Unlock() }

// The methods below require Lock to be held. They deliberately keep index
// details private to this type while allowing a single atomic call transition.
func (m *CallManager) ByChatLocked(chatID string) (*callSession, bool) {
	session, ok := m.byChat[chatID]
	return session, ok
}

func (m *CallManager) ByRoomLocked(roomID string) (*callSession, bool) {
	session, ok := m.byRoom[roomID]
	return session, ok
}

func (m *CallManager) ActiveRoomLocked(userID string) (string, bool) {
	roomID, ok := m.activeByUser[userID]
	return roomID, ok
}

func (m *CallManager) SetActiveLocked(userID, roomID string) { m.activeByUser[userID] = roomID }
func (m *CallManager) ClearActiveLocked(userID string)        { delete(m.activeByUser, userID) }

func (m *CallManager) IndexLocked(session *callSession) {
	m.byRoom[session.ID] = session
	m.byChat[session.ChatID] = session
	for userID, participant := range session.Participants {
		if participant != nil && participant.State != participantLeft && participant.State != participantDeclined {
			m.activeByUser[userID] = session.ID
		}
	}
}

func (m *CallManager) UnindexLocked(session *callSession) {
	delete(m.byRoom, session.ID)
	delete(m.byChat, session.ChatID)
	for userID := range session.Participants {
		if m.activeByUser[userID] == session.ID {
			delete(m.activeByUser, userID)
		}
	}
}

func (m *CallManager) CountLocked() int { return len(m.byRoom) }

// Seed is intended for focused tests and restoration code.
func (m *CallManager) Seed(session *callSession) {
	m.Lock()
	defer m.Unlock()
	m.IndexLocked(session)
}

func (m *CallManager) Reset() {
	m.Lock()
	defer m.Unlock()
	m.byChat = make(map[string]*callSession)
	m.byRoom = make(map[string]*callSession)
	m.activeByUser = make(map[string]string)
}

func (m *CallManager) Has(session *callSession) (byRoom, byChat bool) {
	m.Lock()
	defer m.Unlock()
	_, byRoom = m.byRoom[session.ID]
	_, byChat = m.byChat[session.ChatID]
	return byRoom, byChat
}
