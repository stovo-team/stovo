package app

import (
	"sync"

	socketio "github.com/doquangtan/socketio/v4"
)

// socketSession is the per-connection state used for presence and notification
// suppression. It deliberately stays private to the realtime adapter.
type socketSession struct {
	User         userPublic
	Foreground   bool
	ActiveChatID string
}

// SessionRegistry owns all live socket and per-socket app-state indexes.
// Callers only receive a snapshot of a user's sockets, so emitting does not
// hold the registry lock while the socket library performs I/O.
type SessionRegistry struct {
	mu          sync.RWMutex
	sessions    map[string]socketSession
	userSockets map[string]map[string]*socketio.Socket
}

func NewSessionRegistry() *SessionRegistry {
	return &SessionRegistry{
		sessions:    make(map[string]socketSession),
		userSockets: make(map[string]map[string]*socketio.Socket),
	}
}

func (r *SessionRegistry) Register(user userPublic, socket *socketio.Socket) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sessions[socket.Id] = socketSession{User: user}
	if r.userSockets[user.ID] == nil {
		r.userSockets[user.ID] = make(map[string]*socketio.Socket)
	}
	r.userSockets[user.ID][socket.Id] = socket
}

func (r *SessionRegistry) Unregister(userID, socketID string) {
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

func (r *SessionRegistry) SetAppState(socketID string, foreground bool, activeChatID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if session, ok := r.sessions[socketID]; ok {
		session.Foreground = foreground
		session.ActiveChatID = activeChatID
		r.sessions[socketID] = session
	}
}

func (r *SessionRegistry) IsOnline(userID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.userSockets[userID]) > 0
}

func (r *SessionRegistry) SocketsForUser(userID string) []*socketio.Socket {
	r.mu.RLock()
	defer r.mu.RUnlock()
	sockets := r.userSockets[userID]
	targets := make([]*socketio.Socket, 0, len(sockets))
	for _, socket := range sockets {
		targets = append(targets, socket)
	}
	return targets
}

func (r *SessionRegistry) IsViewingChatInForeground(userID, chatID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for socketID := range r.userSockets[userID] {
		if session, ok := r.sessions[socketID]; ok && session.Foreground && session.ActiveChatID == chatID {
			return true
		}
	}
	return false
}
