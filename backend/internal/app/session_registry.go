package app

import (
	socketio "github.com/doquangtan/socketio/v4"
	workruntime "stovo-messenger/backend/internal/runtime"
)

// SessionRegistry is the Socket.IO adapter for runtime-owned live connection
// state. It keeps Socket.IO types at the transport edge.
type SessionRegistry struct {
	runtime *workruntime.LiveSessionRegistry
}

func NewSessionRegistry() *SessionRegistry {
	return &SessionRegistry{runtime: workruntime.NewLiveSessionRegistry()}
}

func (r *SessionRegistry) Register(user userPublic, socket *socketio.Socket) {
	r.runtime.Register(user.ID, socket.Id, socket)
}

func (r *SessionRegistry) Unregister(userID, socketID string) {
	r.runtime.Unregister(userID, socketID)
}

func (r *SessionRegistry) SetAppState(socketID string, foreground bool, activeChatID string) {
	r.runtime.SetAppState(socketID, foreground, activeChatID)
}

func (r *SessionRegistry) IsOnline(userID string) bool {
	return r.runtime.IsOnline(userID)
}

func (r *SessionRegistry) SocketsForUser(userID string) []*socketio.Socket {
	values := r.runtime.SocketsForUser(userID)
	targets := make([]*socketio.Socket, 0, len(values))
	for _, value := range values {
		if socket, ok := value.(*socketio.Socket); ok {
			targets = append(targets, socket)
		}
	}
	return targets
}

func (r *SessionRegistry) IsViewingChatInForeground(userID, chatID string) bool {
	return r.runtime.IsViewingChatInForeground(userID, chatID)
}
