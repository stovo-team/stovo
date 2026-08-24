package app

import (
	"context"
	"errors"
	"strings"
	"time"

	"family-messenger/backend/internal/cache"

	socketio "github.com/doquangtan/socketio/v4"
)

// onSocketDisconnect handles the "disconnect" event for a given user socket.
// It applies a grace period before tearing down calls to tolerate
// polling→WebSocket transport upgrades and brief reconnects.
func (s *Server) onSocketDisconnect(socket *socketio.Socket, user userPublic) {
	s.sessions.Unregister(user.ID, socket.Id)
	if s.sessions.IsOnline(user.ID) {
		return
	}
	userID := user.ID
	go func() {
		grace := 2 * time.Second
		if s.userHasActiveCall(userID) {
			// Polling→WebSocket upgrade (or brief reconnect) during a call
			// must not tear down the session before ICE can finish.
			grace = 10 * time.Second
		}
		time.Sleep(grace)
		if s.sessions.IsOnline(userID) {
			return
		}
		if ended, ok := s.endCallForUser(userID); ok {
			s.recordCallHistory(ended, "disconnected")
			payload := ended.actionPayload(map[string]any{
				"reason":  "disconnected",
				"endedAt": nowString(),
			})
			s.emitCallToParticipants(ended, "call:ended", payload)
		}
	}()
	if err := cache.NewPresenceService(s.cache).MarkOffline(context.Background(), userID); err != nil {
		s.logger.Warnf("realtime", "presence offline update failed user_id=%s error=%v", userID, err)
	}
	if err := s.store.UpdateUserLastSeen(context.Background(), userID, nowString()); err != nil {
		s.logger.Warnf("realtime", "last seen update failed user_id=%s error=%v", userID, err)
	}
}

// onSocketHealthPing responds to the "health:ping" event with an echoed pong.
func (s *Server) onSocketHealthPing(socket *socketio.Socket, event *socketio.EventPayload) {
	payload := map[string]any{}
	if len(event.Data) > 0 {
		payload = toMap(event.Data[0])
	}
	_ = socket.Emit("health:pong", map[string]any{
		"status": "ok",
		"echo":   payload,
	})
}

// onSocketAppState handles the "app:state" event to track foreground/background
// and the active chat ID for the connected socket session.
func (s *Server) onSocketAppState(socket *socketio.Socket, user userPublic, event *socketio.EventPayload) {
	var payload struct {
		Foreground   bool   `json:"foreground"`
		ActiveChatID string `json:"activeChatId"`
	}
	if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil {
		return
	}
	s.sessions.SetAppState(socket.Id, payload.Foreground, payload.ActiveChatID)
	s.logger.Debugf("realtime.app_state", "socket_id=%s user_id=%s foreground=%v", socket.Id, user.ID, payload.Foreground)
}

// onSocketMessageSend handles the "message:send" event: rate-limits, creates
// the message, and acknowledges the client.
func (s *Server) onSocketMessageSend(socket *socketio.Socket, user userPublic, event *socketio.EventPayload) {
	payload := socketSendMessageRequest{}
	if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || strings.TrimSpace(payload.ChatID) == "" {
		s.emitSocketError(socket, payload.ClientMessageID, "Invalid message payload")
		if event.Ack != nil {
			event.Ack(map[string]any{"ok": false, "message": "Invalid message payload", "clientMessageId": payload.ClientMessageID})
		}
		return
	}
	if err := s.checkSocketRateLimit(socket, user, payload.ClientMessageID, event); err != nil {
		return
	}
	message, err := s.createMessageFromSocket(user, payload)
	if err != nil {
		s.emitSocketError(socket, payload.ClientMessageID, err.Error())
		if event.Ack != nil {
			event.Ack(map[string]any{"ok": false, "message": err.Error(), "clientMessageId": payload.ClientMessageID})
		}
		return
	}
	if event.Ack != nil {
		event.Ack(message)
	}
}

// checkSocketRateLimit checks the message rate limit for the user and emits an
// error on the socket if the limit is exceeded. Returns a non-nil error when
// the caller should abort.
func (s *Server) checkSocketRateLimit(socket *socketio.Socket, user userPublic, clientMessageID *string, event *socketio.EventPayload) error {
	_, err := cache.NewRateLimitService(s.cache).CheckMessage(context.Background(), user.ID)
	if err == nil {
		return nil
	}
	message := "Could not verify rate limit"
	var limitErr cache.RateLimitExceededError
	if errors.As(err, &limitErr) {
		message = "Rate limit exceeded"
	}
	s.emitSocketError(socket, clientMessageID, message)
	if event.Ack != nil {
		event.Ack(map[string]any{"ok": false, "message": message, "clientMessageId": clientMessageID})
	}
	return err
}

// onSocketMessageRead handles the "message:read" event.
func (s *Server) onSocketMessageRead(socket *socketio.Socket, user userPublic, event *socketio.EventPayload) {
	var payload socketReadRequest
	if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || strings.TrimSpace(payload.MessageID) == "" {
		s.emitSocketError(socket, nil, "Invalid read payload")
		return
	}
	message, chatID, err := s.markMessageRead(context.Background(), user, payload.MessageID)
	if err != nil {
		s.emitSocketError(socket, nil, err.Error())
		return
	}
	s.emitMessageRead(chatID, message.ID, user.ID)
	s.bumpChatHistoryRevision(context.Background(), chatID)
}

// onSocketTyping handles "typing:start" and "typing:stop" events.
func (s *Server) onSocketTyping(socket *socketio.Socket, user userPublic, event *socketio.EventPayload, isTyping bool) {
	var payload socketTypingRequest
	if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil {
		s.emitSocketError(socket, nil, "Invalid typing payload")
		return
	}
	if err := s.emitTyping(payload.ChatID, user, isTyping); err != nil {
		s.emitSocketError(socket, nil, err.Error())
	}
}
