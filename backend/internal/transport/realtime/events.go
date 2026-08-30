package realtime

import "context"

import socketio "github.com/doquangtan/socketio/v4"

// SocketLifecycleHandlers describes the two Socket.IO server lifecycle hooks.
// Their registration belongs to the realtime transport; authentication and
// connection policy are supplied by outer composition.
type SocketLifecycleHandlers struct {
	Authenticate func(map[string]string) bool
	Connect      func(*socketio.Socket)
}

func ConfigureSocketLifecycle(server *socketio.Io, handlers SocketLifecycleHandlers) {
	if server == nil {
		return
	}
	if handlers.Authenticate != nil {
		server.OnAuthentication(handlers.Authenticate)
	}
	if handlers.Connect != nil {
		server.OnConnection(handlers.Connect)
	}
}

// CoreEventHandlers contains the driving-adapter callbacks for Socket.IO
// events that are not call-specific. The transport owns their registration;
// callers retain the application behavior behind these callbacks.
type CoreEventHandlers struct {
	Disconnect  func(*socketio.EventPayload)
	HealthPing  func(*socketio.EventPayload)
	AppState    func(*socketio.EventPayload)
	MessageSend func(*socketio.EventPayload)
	MessageRead func(*socketio.EventPayload)
	TypingStart func(*socketio.EventPayload)
	TypingStop  func(*socketio.EventPayload)
}

// CallEventHandlers is the complete inbound call bridge.  Socket.IO event
// spelling and registration belong to this driving adapter; a coordinator
// supplies policy callbacks without importing Socket.IO registration details.
type CallEventHandlers struct {
	Start   func(*socketio.EventPayload)
	Join    func(*socketio.EventPayload)
	Invite  func(*socketio.EventPayload)
	Accept  func(*socketio.EventPayload)
	Decline func(*socketio.EventPayload)
	Cancel  func(*socketio.EventPayload)
	Leave   func(*socketio.EventPayload)
	End     func(*socketio.EventPayload)
	Signal  func(*socketio.EventPayload)
}

// CallActor is the identity the realtime transport passes to a call
// coordinator. It deliberately contains transport-neutral scalar values only:
// coordinators must not receive app.Server, Socket.IO user models, or session
// registry entries.
type CallActor struct {
	UserID   string
	SocketID string
}

// CallEventCoordinator is the explicit seam between the Socket.IO driving
// adapter and call lifecycle coordination. Implementations normally live in a
// runtime/application adapter and can use their own private session model;
// the realtime transport only knows the stable event name, actor and raw
// event payload.
//
// Raw payload decoding remains an intentional transport concern and is
// exposed through DecodePayload. This interface makes the dependency
// direction explicit while allowing the legacy coordinator to be cut over one
// event family at a time without changing the wire contract.
type CallEventCoordinator interface {
	HandleCallEvent(context.Context, CallActor, CallEvent, *socketio.EventPayload)
}

// CallbackCallCoordinator adapts independently supplied event callbacks to a
// CallEventCoordinator. It is useful during incremental migration: transport
// registration depends on the coordinator interface, while an outer adapter
// can retain existing callbacks until their runtime implementation is moved.
type CallbackCallCoordinator struct {
	Start, Join, Invite, Accept, Decline, Cancel, Leave, End, Signal func(*socketio.EventPayload)
}

// HandleCallEvent dispatches the stable call event to its callback. Missing
// callbacks are intentionally no-ops, which keeps optional call capabilities
// from registering a nil Socket.IO handler.
func (c CallbackCallCoordinator) HandleCallEvent(_ context.Context, _ CallActor, event CallEvent, payload *socketio.EventPayload) {
	var handler func(*socketio.EventPayload)
	switch event {
	case CallStart:
		handler = c.Start
	case CallJoin:
		handler = c.Join
	case CallInvite:
		handler = c.Invite
	case CallAccept:
		handler = c.Accept
	case CallDecline:
		handler = c.Decline
	case CallCancel:
		handler = c.Cancel
	case CallLeave:
		handler = c.Leave
	case CallEnd:
		handler = c.End
	case CallSignal:
		handler = c.Signal
	}
	if handler != nil {
		handler(payload)
	}
}

// CoreEventNames documents the stable Socket.IO event contract registered by
// RegisterCoreEvents. Keep the order aligned with registration for review.
var CoreEventNames = []string{
	"disconnect",
	"health:ping",
	"app:state",
	"message:send",
	"message:read",
	"typing:start",
	"typing:stop",
}

// CallEvent is a stable inbound call event name. Keeping these names at the
// driving-adapter boundary prevents the call coordinator from becoming the
// owner of Socket.IO protocol spelling.
type CallEvent string

const (
	CallStart   CallEvent = "call:start"
	CallJoin    CallEvent = "call:join"
	CallInvite  CallEvent = "call:invite"
	CallAccept  CallEvent = "call:accept"
	CallDecline CallEvent = "call:decline"
	CallCancel  CallEvent = "call:cancel"
	CallLeave   CallEvent = "call:leave"
	CallEnd     CallEvent = "call:end"
	CallSignal  CallEvent = "call:signal"
)

// CallEventNames documents the complete call Socket.IO contract. Call
// lifecycle code supplies callbacks but never owns event registration names.
var CallEventNames = []CallEvent{
	CallStart, CallJoin, CallInvite, CallAccept, CallDecline,
	CallCancel, CallLeave, CallEnd, CallSignal,
}

// RegisterCallEvent binds a call bridge callback without exposing raw event
// names to the lifecycle coordinator.
func RegisterCallEvent(socket *socketio.Socket, event CallEvent, handler func(*socketio.EventPayload)) {
	socket.On(string(event), handler)
}

// RegisterCallEvents installs the entire stable call protocol in one place.
func RegisterCallEvents(socket *socketio.Socket, handlers CallEventHandlers) {
	RegisterCallEvent(socket, CallStart, handlers.Start)
	RegisterCallEvent(socket, CallJoin, handlers.Join)
	RegisterCallEvent(socket, CallInvite, handlers.Invite)
	RegisterCallEvent(socket, CallAccept, handlers.Accept)
	RegisterCallEvent(socket, CallDecline, handlers.Decline)
	RegisterCallEvent(socket, CallCancel, handlers.Cancel)
	RegisterCallEvent(socket, CallLeave, handlers.Leave)
	RegisterCallEvent(socket, CallEnd, handlers.End)
	RegisterCallEvent(socket, CallSignal, handlers.Signal)
}

// RegisterCallCoordinator installs the call event contract for a typed
// coordinator. This is the preferred registration API for new runtime call
// coordinators; it prevents transport composition from depending on app
// private call/session types.
func RegisterCallCoordinator(socket *socketio.Socket, actor CallActor, coordinator CallEventCoordinator) {
	if coordinator == nil {
		return
	}
	for _, event := range CallEventNames {
		RegisterCallEventCoordinator(socket, actor, event, coordinator)
	}
}

// RegisterCallEventCoordinator binds one call event through the typed
// coordinator seam. It supports incremental cutovers where only one legacy
// callback has moved without accidentally registering no-op handlers for the
// rest of the protocol.
func RegisterCallEventCoordinator(socket *socketio.Socket, actor CallActor, event CallEvent, coordinator CallEventCoordinator) {
	if coordinator == nil {
		return
	}
	RegisterCallEvent(socket, event, func(payload *socketio.EventPayload) {
		coordinator.HandleCallEvent(context.Background(), actor, event, payload)
	})
}

// RegisterCoreEvents binds the established inbound events to callbacks. It is
// deliberately policy-free: payload interpretation and acknowledgements stay
// with the supplied application callbacks.
func RegisterCoreEvents(socket *socketio.Socket, handlers CoreEventHandlers) {
	socket.On("disconnect", handlers.Disconnect)
	socket.On("health:ping", handlers.HealthPing)
	socket.On("app:state", handlers.AppState)
	socket.On("message:send", handlers.MessageSend)
	socket.On("message:read", handlers.MessageRead)
	socket.On("typing:start", handlers.TypingStart)
	socket.On("typing:stop", handlers.TypingStop)
}
