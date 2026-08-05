package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"family-messenger/backend/internal/broker"
	"family-messenger/backend/internal/cache"
	"family-messenger/backend/internal/repository"

	socketio "github.com/doquangtan/socketio/v4"
	"github.com/google/uuid"
)

func (s *Server) configureSockets() {
	s.sockets.OnAuthentication(func(params map[string]string) bool {
		token := strings.TrimSpace(params["token"])
		if token == "" {
			return false
		}
		claims, err := parseAccessToken(s.cfg, token)
		if err != nil {
			return false
		}
		user, err := s.getUserByID(claims.UserID)
		return err == nil && user.IsActive
	})

	s.sockets.OnConnection(func(socket *socketio.Socket) {
		token := s.socketAccessToken(socket)
		if token == "" {
			_ = socket.Disconnect()
			return
		}

		claims, err := parseAccessToken(s.cfg, token)
		if err != nil {
			_ = socket.Disconnect()
			return
		}
		user, err := s.getUserByID(claims.UserID)
		if err != nil || !user.IsActive {
			_ = socket.Disconnect()
			return
		}

		s.registerSocket(user, socket)
		if err := cache.NewPresenceService(s.cache).MarkOnline(context.Background(), user.ID, 60); err != nil {
			s.logger.Warnf("realtime", "presence online update failed user_id=%s error=%v", user.ID, err)
		}
		socket.Join("user:" + user.ID)

		chats, err := s.listChats(user)
		if err == nil {
			for _, chat := range chats {
				socket.Join("chat:" + chat.ID)
			}
		}

		// Re-emit call:ringing to this socket if there is a pending incoming call
		// for the user. This handles the case where the callee's Android socket
		// reconnects (e.g. app foregrounded from a notification) after the original
		// call:ringing event was already sent to the previous socket.
		if ringing := s.getRingingSessionForUser(user.ID); ringing != nil {
			payloadMap := ringing.publicPayload()
			s.logger.Infof("realtime.call", "call:ringing re-emitted on reconnect user_id=%s chat_id=%s socket_id=%s", user.ID, ringing.ChatID, socket.Id)
			_ = socket.Emit("call:ringing", payloadMap)
		} else if active := s.getActiveCallSessionForUser(user.ID); active != nil {
			// Re-sync an in-progress call after a socket reconnect so WebRTC signaling
			// can resume instead of leaving the client stuck on "Connecting…".
			payloadMap := active.publicPayload()
			s.logger.Infof("realtime.call", "call:sync re-emitted on reconnect user_id=%s chat_id=%s state=%s", user.ID, active.ChatID, active.State)
			_ = socket.Emit("call:sync", payloadMap)
		}

		go func() {
			events := s.drainPendingEvents(context.Background(), user.ID)
			for _, ev := range events {
				if err := socket.Emit(ev.Event, ev.Payload); err != nil {
					s.logger.Warnf("realtime", "replay event failed user_id=%s event=%s: %v", user.ID, ev.Event, err)
				}
			}
			_ = socket.Emit("sync:needed", map[string]any{"ts": time.Now().UTC().Format(time.RFC3339)})
		}()

		socket.On("disconnect", func(_ *socketio.EventPayload) {
			s.unregisterSocket(user.ID, socket.Id)
			// Only end the call when the user has no remaining sockets.
			// A polling→WebSocket transport upgrade fires a disconnect for the
			// old polling socket while the new WebSocket is already registered;
			// ending the call in that window would silently kill every call on a
			// non-localhost hostname. Debounce with a short grace period so a
			// reconnecting socket is not treated as a full disconnect.
			if !s.userOnline(user.ID) {
				userID := user.ID
				go func() {
					grace := 2 * time.Second
					if s.userHasActiveCall(userID) {
						// Polling→WebSocket upgrade (or brief reconnect) during a call
						// must not tear down the session before ICE can finish.
						grace = 10 * time.Second
					}
					time.Sleep(grace)
					if s.userOnline(userID) {
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
			}
			if !s.userOnline(user.ID) {
				if err := cache.NewPresenceService(s.cache).MarkOffline(context.Background(), user.ID); err != nil {
					s.logger.Warnf("realtime", "presence offline update failed user_id=%s error=%v", user.ID, err)
				}
			}
		})

		socket.On("health:ping", func(event *socketio.EventPayload) {
			payload := map[string]any{}
			if len(event.Data) > 0 {
				payload = toMap(event.Data[0])
			}
			_ = socket.Emit("health:pong", map[string]any{
				"status": "ok",
				"echo":   payload,
			})
		})

		socket.On("app:state", func(event *socketio.EventPayload) {
			var payload struct {
				Foreground   bool   `json:"foreground"`
				ActiveChatID string `json:"activeChatId"`
			}
			if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil {
				return
			}
			s.socketMu.Lock()
			if session, ok := s.socketUsers[socket.Id]; ok {
				session.Foreground = payload.Foreground
				session.ActiveChatID = payload.ActiveChatID
				s.socketUsers[socket.Id] = session
			}
			s.socketMu.Unlock()
			s.logger.Debugf("realtime.app_state", "socket_id=%s user_id=%s foreground=%v", socket.Id, user.ID, payload.Foreground)
		})

		socket.On("message:send", func(event *socketio.EventPayload) {
			payload := socketSendMessageRequest{}
			if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || strings.TrimSpace(payload.ChatID) == "" {
				s.emitSocketError(socket, payload.ClientMessageID, "Invalid message payload")
				if event.Ack != nil {
					event.Ack(map[string]any{"ok": false, "message": "Invalid message payload", "clientMessageId": payload.ClientMessageID})
				}
				return
			}
			if _, err := cache.NewRateLimitService(s.cache).CheckMessage(context.Background(), user.ID); err != nil {
				message := "Could not verify rate limit"
				var limitErr cache.RateLimitExceededError
				if errors.As(err, &limitErr) {
					message = "Rate limit exceeded"
				}
				s.emitSocketError(socket, payload.ClientMessageID, message)
				if event.Ack != nil {
					event.Ack(map[string]any{"ok": false, "message": message, "clientMessageId": payload.ClientMessageID})
				}
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
		})

		socket.On("message:read", func(event *socketio.EventPayload) {
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
		})

		socket.On("typing:start", func(event *socketio.EventPayload) {
			var payload socketTypingRequest
			if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil {
				s.emitSocketError(socket, nil, "Invalid typing payload")
				return
			}
			if err := s.emitTyping(payload.ChatID, user, true); err != nil {
				s.emitSocketError(socket, nil, err.Error())
			}
		})

		socket.On("typing:stop", func(event *socketio.EventPayload) {
			var payload socketTypingRequest
			if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil {
				s.emitSocketError(socket, nil, "Invalid typing payload")
				return
			}
			if err := s.emitTyping(payload.ChatID, user, false); err != nil {
				s.emitSocketError(socket, nil, err.Error())
			}
		})

		s.registerCallSocketHandlers(socket, user)
	})
}

func (s *Server) createMessageFromSocket(user userPublic, payload socketSendMessageRequest) (messagePublic, error) {
	request := sendMessageRequest{
		Type:                "",
		Content:             payload.Content,
		FileIDs:             payload.FileIDs,
		ReplyToMessageID:    payload.ReplyToMessageID,
		ThreadRootMessageID: payload.ThreadRootMessageID,
		EncryptionProtocol:  payload.EncryptionProtocol,
		Ciphertext:          payload.Ciphertext,
		Nonce:               payload.Nonce,
		KeyVersion:          payload.KeyVersion,
		EncryptionMetadata:  payload.EncryptionMetadata,
	}
	message, err := s.createMessageWithPayload(user, payload.ChatID, request, payload.ClientMessageID, nil)
	if err != nil {
		return messagePublic{}, err
	}
	return message, nil
}

func (s *Server) createMessageWithPayload(user userPublic, chatID string, payload sendMessageRequest, clientMessageID *string, forwarded *messageForwardSource) (messagePublic, error) {
	return s.createMessageWithPayloadContext(context.Background(), user, chatID, payload, clientMessageID, forwarded)
}

func (s *Server) createMessageWithPayloadContext(ctx context.Context, user userPublic, chatID string, payload sendMessageRequest, clientMessageID *string, forwarded *messageForwardSource) (messagePublic, error) {
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return messagePublic{}, errNotFound
	}
	if chat.Type == "direct" {
		for _, member := range chat.Members {
			if member.ID == user.ID {
				continue
			}
			blocked, blockErr := s.directContactBlocked(user.ID, member.ID)
			if blockErr != nil {
				return messagePublic{}, newStatusError(500, "could not check privacy settings")
			}
			if blocked {
				return messagePublic{}, newStatusError(403, "direct messages are unavailable for this member")
			}
		}
	}
	canPost := s.canSendToChat(chat, user)
	threadRootMessageID := trimStringPointer(payload.ThreadRootMessageID)
	if !canPost {
		if chat.Type != "channel" {
			return messagePublic{}, errForbidden
		}
		if !chat.CommentsEnabled || threadRootMessageID == nil {
			return messagePublic{}, errForbidden
		}
		if err := s.validateReplyTarget(chatID, *threadRootMessageID); err != nil {
			return messagePublic{}, err
		}
		payload.ThreadRootMessageID = threadRootMessageID
		payload.ReplyToMessageID = nil
	} else if payload.ReplyToMessageID != nil {
		replyToMessageID := trimStringPointer(payload.ReplyToMessageID)
		if replyToMessageID != nil {
			if err := s.validateReplyTarget(chatID, *replyToMessageID); err != nil {
				return messagePublic{}, err
			}
		}
		payload.ReplyToMessageID = replyToMessageID
	}
	if payload.ThreadRootMessageID != nil {
		root := trimStringPointer(payload.ThreadRootMessageID)
		if root == nil {
			payload.ThreadRootMessageID = nil
		} else {
			if err := s.validateReplyTarget(chatID, *root); err != nil {
				return messagePublic{}, err
			}
			payload.ThreadRootMessageID = root
		}
	}
	content := trimStringPointer(payload.Content)
	if content != nil && *content == "" {
		content = nil
	}
	if content != nil && len(*content) > 4000 {
		return messagePublic{}, newStatusError(422, "message content is too long")
	}
	encryptionProtocol, ciphertext, nonce, keyVersion, metadata, err := s.prepareMessageEncryption(chat, content, payload)
	if err != nil {
		return messagePublic{}, err
	}
	if content == nil && ciphertext == nil && len(payload.FileIDs) == 0 {
		return messagePublic{}, errBadRequest
	}
	attachments, err := s.loadAttachmentsForMessage(payload.FileIDs, user, chatID)
	if err != nil {
		return messagePublic{}, err
	}
	messageType := payload.Type
	if messageType == "" {
		messageType = chooseMessageType(content, attachments)
	}
	if messageType != "text" && messageType != "image" && messageType != "video" && messageType != "file" && messageType != "mixed" {
		return messagePublic{}, errBadRequest
	}
	onlineRecipients := make([]string, 0)
	for _, member := range chat.Members {
		if member.ID == user.ID {
			continue
		}
		if s.userOnline(member.ID) {
			onlineRecipients = append(onlineRecipients, member.ID)
		}
	}

	messageID := uuid.NewString()
	now := nowString()
	var forwardedMessageID *string
	var forwardedChatID *string
	if forwarded != nil {
		forwardedMessageID = &forwarded.MessageID
		forwardedChatID = &forwarded.ChatID
	}
	messageKind := "chat"
	if payload.ThreadRootMessageID != nil {
		messageKind = "thread"
	}
	attachmentFileIDs := make([]string, 0, len(attachments))
	for _, file := range attachments {
		attachmentFileIDs = append(attachmentFileIDs, file.ID)
	}
	err = s.store.CreateMessageBundle(ctx, repository.CreateMessageBundleParams{
		MessageID:              messageID,
		ChatID:                 chatID,
		SenderID:               user.ID,
		Type:                   messageType,
		Content:                content,
		EncryptionProtocol:     encryptionProtocol,
		Ciphertext:             ciphertext,
		Nonce:                  nonce,
		KeyVersion:             keyVersion,
		EncryptionMetadata:     metadata,
		ReplyToMessageID:       payload.ReplyToMessageID,
		ThreadRootMessageID:    payload.ThreadRootMessageID,
		MessageKind:            messageKind,
		ForwardedFromMessageID: forwardedMessageID,
		ForwardedFromChatID:    forwardedChatID,
		CreatedAt:              now,
		AttachmentFileIDs:      attachmentFileIDs,
		DeliveredRecipientIDs:  onlineRecipients,
	})
	if err != nil {
		return messagePublic{}, err
	}

	message, err := s.buildMessage(messageID, user.ID)
	if err != nil {
		return messagePublic{}, err
	}
	message.ClientMessageID = clientMessageID
	s.bumpChatHistoryRevision(ctx, chatID)
	if err := s.broker.Publish(context.Background(), brokerChannelMessages, broker.BrokerEvent{
		"event_id":   uuid.NewString(),
		"type":       "message.created",
		"chat_id":    chatID,
		"message_id": message.ID,
		"payload":    toMap(message),
	}); err != nil {
		s.logger.Warnf("realtime", "broker publish failed channel=%s chat_id=%s error=%v", brokerChannelMessages, chatID, err)
		s.emitMessageNew(chat, message)
	}
	go s.notifyMessageRecipients(chatID, chat.Type, chat.Title, user.ID, user.DisplayName, truncatePreview(message.Content))
	return message, nil
}

func (s *Server) validateReplyTarget(chatID, replyToMessageID string) error {
	ok, err := s.store.ActiveMessageExistsInChat(context.Background(), replyToMessageID, chatID)
	if err != nil {
		return err
	}
	if !ok {
		return newStatusError(422, "invalid reply target")
	}
	return nil
}

func (s *Server) prepareMessageEncryption(chat chatPublic, content *string, payload sendMessageRequest) (string, *string, *string, *int, *string, error) {
	protocol, err := normalizeEncryptionProtocol(chat.EncryptionProtocol)
	if err != nil {
		protocol = encryptionProtocolServerAtRest
	}
	if payload.EncryptionProtocol != nil && strings.TrimSpace(*payload.EncryptionProtocol) != "" {
		requested, err := normalizeEncryptionProtocol(*payload.EncryptionProtocol)
		if err != nil {
			return "", nil, nil, nil, nil, err
		}
		if requested != protocol {
			return "", nil, nil, nil, nil, fmt.Errorf("message encryption protocol does not match chat")
		}
	}
	switch protocol {
	case encryptionProtocolEndToEnd:
		if content != nil && strings.TrimSpace(*content) != "" {
			return "", nil, nil, nil, nil, fmt.Errorf("end-to-end encrypted messages cannot include plaintext content")
		}
		ciphertext := trimStringPointer(payload.Ciphertext)
		nonce := trimStringPointer(payload.Nonce)
		metadata := trimStringPointer(payload.EncryptionMetadata)
		if ciphertext == nil && len(payload.FileIDs) == 0 {
			return "", nil, nil, nil, nil, fmt.Errorf("encrypted content is required")
		}
		if ciphertext != nil && nonce == nil {
			return "", nil, nil, nil, nil, fmt.Errorf("encryption nonce is required")
		}
		keyVersion := payload.KeyVersion
		if keyVersion == nil && ciphertext != nil {
			value := 1
			keyVersion = &value
		}
		return protocol, ciphertext, nonce, keyVersion, metadata, nil
	case encryptionProtocolServerAtRest:
		if content == nil {
			return protocol, nil, nil, nil, nil, nil
		}
		ciphertext, nonce, err := s.encryptServerAtRest(chat.FamilyID, *content)
		if err != nil {
			return "", nil, nil, nil, nil, err
		}
		keyVersion := 1
		metadata := messageEncryptionMetadataServer
		return protocol, &ciphertext, &nonce, &keyVersion, &metadata, nil
	default:
		return encryptionProtocolLegacyPlain, nil, nil, nil, nil, nil
	}
}

func (s *Server) emitMessageNew(chat chatPublic, message messagePublic) {
	for _, member := range chat.Members {
		_ = s.sockets.To("user:"+member.ID).Emit("message:new", message)
	}
	onlineRecipients := make([]string, 0)
	for _, member := range chat.Members {
		if member.ID == message.SenderID {
			continue
		}
		if s.userOnline(member.ID) {
			onlineRecipients = append(onlineRecipients, member.ID)
		}
	}
	if len(onlineRecipients) > 0 {
		payload := map[string]any{
			"messageId": message.ID,
			"chatId":    message.ChatID,
			"userIds":   onlineRecipients,
		}
		for _, member := range chat.Members {
			_ = s.sockets.To("user:"+member.ID).Emit("message:delivered", payload)
		}
	}

	// Queue for offline recipients
	for _, member := range chat.Members {
		if member.ID == message.SenderID {
			continue
		}
		if s.userOnline(member.ID) {
			continue
		}
		mID := member.ID
		go s.enqueueEventForUser(context.Background(), mID, "message:new", message)
	}
}

func (s *Server) emitMessageRead(chatID, messageID, userID string) {
	members, err := s.chatMembers(chatID)
	if err != nil {
		return
	}
	payload := map[string]any{
		"messageId": messageID,
		"chatId":    chatID,
		"userId":    userID,
	}
	for _, member := range members {
		_ = s.sockets.To("user:"+member.ID).Emit("message:read", payload)
	}
}

func (s *Server) emitMessageUpdated(chatID string, message messagePublic) {
	members, err := s.chatMembers(chatID)
	if err != nil {
		return
	}
	for _, member := range members {
		_ = s.sockets.To("user:"+member.ID).Emit("message:updated", message)
	}
}

func (s *Server) emitMessageDeleted(chatID string, messageID string) {
	members, err := s.chatMembers(chatID)
	if err != nil {
		return
	}
	payload := map[string]any{"messageId": messageID, "chatId": chatID}
	for _, member := range members {
		_ = s.sockets.To("user:"+member.ID).Emit("message:deleted", payload)
	}
}

func (s *Server) emitMessagePinned(chatID string, pin pinnedMessagePublic) {
	members, err := s.chatMembers(chatID)
	if err != nil {
		return
	}
	for _, member := range members {
		_ = s.sockets.To("user:"+member.ID).Emit("message:pinned", pin)
	}
}

func (s *Server) emitMessageUnpinned(chatID string, messageID string) {
	members, err := s.chatMembers(chatID)
	if err != nil {
		return
	}
	payload := map[string]any{"chatId": chatID, "messageId": messageID}
	for _, member := range members {
		_ = s.sockets.To("user:"+member.ID).Emit("message:unpinned", payload)
	}
}

func (s *Server) emitTyping(chatID string, user userPublic, isTyping bool) error {
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return err
	}
	typing := cache.NewTypingService(s.cache)
	if isTyping {
		if err := typing.StartTyping(context.Background(), chatID, user.ID, 10); err != nil {
			s.logger.Warnf("realtime", "typing start update failed chat_id=%s user_id=%s error=%v", chatID, user.ID, err)
		}
	} else {
		if err := typing.StopTyping(context.Background(), chatID, user.ID); err != nil {
			s.logger.Warnf("realtime", "typing stop update failed chat_id=%s user_id=%s error=%v", chatID, user.ID, err)
		}
	}
	payload := map[string]any{
		"chatId":      chatID,
		"userId":      user.ID,
		"displayName": user.DisplayName,
		"isTyping":    isTyping,
	}
	for _, member := range chat.Members {
		if member.ID == user.ID {
			continue
		}
		_ = s.sockets.To("user:"+member.ID).Emit("typing:update", payload)
	}
	return nil
}

func (s *Server) emitSocketError(socket *socketio.Socket, clientMessageID *string, message string) {
	payload := map[string]any{"message": message}
	if clientMessageID != nil && *clientMessageID != "" {
		payload["clientMessageId"] = *clientMessageID
	}
	_ = socket.Emit("error", payload)
}

// emitCallToUser sends a call socket event directly to every socket tracked for
// userID, bypassing the library's room-broadcast path. Room broadcasts fired
// from inside a socket-event handler goroutine can deadlock or silently drop in
// the doquangtan/socketio library; direct socket.Emit never has that problem.
func (s *Server) emitCallToUser(userID, event string, payload any) {
	s.socketMu.RLock()
	sockets := s.userSockets[userID]
	targets := make([]*socketio.Socket, 0, len(sockets))
	for _, sock := range sockets {
		targets = append(targets, sock)
	}
	s.socketMu.RUnlock()
	if len(targets) == 0 {
		s.logger.Warnf("realtime.call", "emitCallToUser: no sockets for user_id=%s event=%s — queueing", userID, event)
		if strings.HasPrefix(event, "call:") {
			go s.enqueueEventForUser(context.Background(), userID, event, payload)
		}
		return
	}
	for _, sock := range targets {
		if err := sock.Emit(event, payload); err != nil {
			s.logger.Warnf("realtime.call", "emitCallToUser: emit failed user_id=%s event=%s socket_id=%s error=%v", userID, event, sock.Id, err)
		} else {
			s.logger.Infof("realtime.call", "emitCallToUser: emitted user_id=%s event=%s socket_id=%s", userID, event, sock.Id)
		}
	}
}

func (s *Server) registerSocket(user userPublic, socket *socketio.Socket) {
	s.socketMu.Lock()
	defer s.socketMu.Unlock()
	s.socketUsers[socket.Id] = socketSession{User: user}
	if s.userSockets[user.ID] == nil {
		s.userSockets[user.ID] = make(map[string]*socketio.Socket)
	}
	s.userSockets[user.ID][socket.Id] = socket
}

func (s *Server) unregisterSocket(userID, socketID string) {
	s.socketMu.Lock()
	defer s.socketMu.Unlock()
	delete(s.socketUsers, socketID)
	if sockets := s.userSockets[userID]; sockets != nil {
		delete(sockets, socketID)
		if len(sockets) == 0 {
			delete(s.userSockets, userID)
		}
	}
}

func (s *Server) userOnline(userID string) bool {
	s.socketMu.RLock()
	defer s.socketMu.RUnlock()
	return len(s.userSockets[userID]) > 0
}

func (s *Server) userViewingChatInForeground(userID string, chatID string) bool {
	s.socketMu.RLock()
	defer s.socketMu.RUnlock()
	for socketID := range s.userSockets[userID] {
		if session, ok := s.socketUsers[socketID]; ok && session.Foreground && session.ActiveChatID == chatID {
			return true
		}
	}
	return false
}

func (s *Server) socketQueryValue(socket *socketio.Socket, key string) string {
	parsed, err := url.Parse(socket.Handshake.URL)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(parsed.Query().Get(key))
}

func (s *Server) socketAccessToken(socket *socketio.Socket) string {
	token := strings.TrimSpace(socket.Handshake.Auth.Token)
	if token != "" {
		return token
	}
	return s.socketQueryValue(socket, "token")
}

func decodeSocketPayload(value any, target any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, target)
}

func toMap(value any) map[string]any {
	result := make(map[string]any)
	data, err := json.Marshal(value)
	if err != nil {
		return result
	}
	_ = json.Unmarshal(data, &result)
	return result
}

func (s *Server) handleGetIceServers(w http.ResponseWriter, r *http.Request, user userPublic) {
	servers := []iceServer{
		{URLs: []string{"stun:stun.l.google.com:19302"}},
	}

	host := s.resolveTurnHost(user)
	if host != "" && s.cfg.TurnEnabled {
		servers = append(servers, iceServer{
			URLs: []string{
				"turn:" + host + ":3478?transport=udp",
				"turn:" + host + ":3478?transport=tcp",
			},
			Username:   s.cfg.TurnUsername,
			Credential: s.cfg.TurnPassword,
		})
		s.logger.Infof("realtime.call", "ice-servers served turn_host=%s user_id=%s", host, user.ID)
	} else {
		s.logger.Warnf("realtime.call", "ice-servers served without TURN (host=%q enabled=%v) user_id=%s", host, s.cfg.TurnEnabled, user.ID)
	}

	s.json(w, http.StatusOK, iceServerResponse{ICEServers: servers})
}

func (s *Server) resolveTurnHost(user userPublic) string {
	// Explicit config takes priority — fastest and most reliable path.
	if s.cfg.TurnHost != "" {
		return s.cfg.TurnHost
	}

	family, err := s.getFamily(user.FamilyID)
	if err == nil && family.PublicAPIURL != nil {
		if parsed, parseErr := url.Parse(*family.PublicAPIURL); parseErr == nil {
			host := parsed.Hostname()

			if !strings.Contains(host, "trycloudflare.com") &&
				!strings.Contains(host, "loca.lt") &&
				!strings.Contains(host, "localtunnel") {
				return host
			}
		}
	}

	ip, err := detectPublicIPv4()
	if err == nil {
		return ip
	}

	return ""
}
