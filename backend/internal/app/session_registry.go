package app

import (
	"sync"

	socketio "github.com/doquangtan/socketio/v4"
	workruntime "stovo-messenger/backend/internal/runtime"
)

// SessionRegistry is the Socket.IO adapter for runtime-owned live connection
// state. It keeps Socket.IO types at the transport edge.
type SessionRegistry struct {
	runtime *workruntime.LiveSessionRegistry
	mu      sync.RWMutex
	sockets map[string]trackedSocket
}

type trackedSocket struct {
	userID   string
	familyID string
	ip       string
	socket   *socketio.Socket
}

type familyIPPair struct {
	familyID string
	ip       string
}

func NewSessionRegistry() *SessionRegistry {
	return &SessionRegistry{runtime: workruntime.NewLiveSessionRegistry(), sockets: make(map[string]trackedSocket)}
}

func (r *SessionRegistry) Register(user userPublic, socket *socketio.Socket) {
	r.RegisterWithIP(user, socket, "")
}

func (r *SessionRegistry) RegisterWithIP(user userPublic, socket *socketio.Socket, ip string) {
	if normalized, ok := normalizeMemberBanIP(ip); ok {
		ip = normalized
	}
	r.runtime.Register(user.ID, socket.Id, socket)
	r.mu.Lock()
	r.sockets[socket.Id] = trackedSocket{userID: user.ID, familyID: user.FamilyID, ip: ip, socket: socket}
	r.mu.Unlock()
}

func (r *SessionRegistry) Unregister(userID, socketID string) {
	r.runtime.Unregister(userID, socketID)
	r.mu.Lock()
	delete(r.sockets, socketID)
	r.mu.Unlock()
}

func (r *SessionRegistry) SocketsForFamilyIP(familyID, ip string) []*socketio.Socket {
	r.mu.RLock()
	defer r.mu.RUnlock()
	targets := make([]*socketio.Socket, 0)
	for _, value := range r.sockets {
		if value.familyID == familyID && value.ip == ip && value.socket != nil {
			targets = append(targets, value.socket)
		}
	}
	return targets
}

// FamilyIPPairs returns the distinct family/IP combinations currently held by
// this process. It lets the ban recovery sweep query once per peer address
// rather than once per connected socket.
func (r *SessionRegistry) FamilyIPPairs() []familyIPPair {
	r.mu.RLock()
	defer r.mu.RUnlock()
	seen := make(map[familyIPPair]struct{})
	pairs := make([]familyIPPair, 0)
	for _, value := range r.sockets {
		if value.familyID == "" || value.ip == "" {
			continue
		}
		pair := familyIPPair{familyID: value.familyID, ip: value.ip}
		if _, exists := seen[pair]; exists {
			continue
		}
		seen[pair] = struct{}{}
		pairs = append(pairs, pair)
	}
	return pairs
}

// DisconnectFamilyIP actively revokes connections that existed before a ban
// was written. The registry keeps the connection peer captured at handshake,
// so the ban affects every same-family socket on that exact IP.
func (r *SessionRegistry) DisconnectFamilyIP(familyID, ip string) int {
	type item struct {
		userID string
		socket *socketio.Socket
	}
	r.mu.Lock()
	items := make([]item, 0)
	for socketID, value := range r.sockets {
		if value.familyID == familyID && value.ip == ip && value.socket != nil {
			items = append(items, item{userID: value.userID, socket: value.socket})
			delete(r.sockets, socketID)
		}
	}
	r.mu.Unlock()
	for _, value := range items {
		r.runtime.Unregister(value.userID, value.socket.Id)
		_ = value.socket.Disconnect()
	}
	return len(items)
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
