package runtime

import "sync"

// LiveSessionRegistry owns process-lifetime connection indexes. It deliberately
// stores transport sockets as opaque values: the realtime transport is the only
// layer that knows how to emit or disconnect a concrete socket.
//
// Presence and foreground-chat state are runtime concerns; no feature code
// should depend on a Socket.IO type to answer them.
type LiveSessionRegistry struct {
	mu          sync.RWMutex
	sessions    map[string]liveSession
	userSockets map[string]map[string]any
}

type liveSession struct {
	userID       string
	foreground   bool
	activeChatID string
}

func NewLiveSessionRegistry() *LiveSessionRegistry {
	return &LiveSessionRegistry{
		sessions:    make(map[string]liveSession),
		userSockets: make(map[string]map[string]any),
	}
}

func (r *LiveSessionRegistry) Register(userID, socketID string, socket any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sessions[socketID] = liveSession{userID: userID}
	if r.userSockets[userID] == nil {
		r.userSockets[userID] = make(map[string]any)
	}
	r.userSockets[userID][socketID] = socket
}

func (r *LiveSessionRegistry) Unregister(userID, socketID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.sessions, socketID)
	if sockets := r.userSockets[userID]; sockets != nil {
		delete(sockets, socketID)
		if len(sockets) == 0 {
			delete(r.userSockets, userID)
		}
	}
}

func (r *LiveSessionRegistry) SetAppState(socketID string, foreground bool, activeChatID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if session, ok := r.sessions[socketID]; ok {
		session.foreground = foreground
		session.activeChatID = activeChatID
		r.sessions[socketID] = session
	}
}

func (r *LiveSessionRegistry) IsOnline(userID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.userSockets[userID]) > 0
}

func (r *LiveSessionRegistry) SocketsForUser(userID string) []any {
	r.mu.RLock()
	defer r.mu.RUnlock()
	sockets := r.userSockets[userID]
	targets := make([]any, 0, len(sockets))
	for _, socket := range sockets {
		targets = append(targets, socket)
	}
	return targets
}

func (r *LiveSessionRegistry) IsViewingChatInForeground(userID, chatID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for socketID := range r.userSockets[userID] {
		if session, ok := r.sessions[socketID]; ok && session.foreground && session.activeChatID == chatID {
			return true
		}
	}
	return false
}
