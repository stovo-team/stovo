package app

import (
	"context"
	"encoding/json"
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
			// can resume instead of leaving the client stuck on "ConnectingРІР‚В¦".
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

		socket.On("disconnect", func(_ *socketio.EventPayload) { s.onSocketDisconnect(socket, user) })
		socket.On("health:ping", func(ev *socketio.EventPayload) { s.onSocketHealthPing(socket, ev) })
		socket.On("app:state", func(ev *socketio.EventPayload) { s.onSocketAppState(socket, user, ev) })
		socket.On("message:send", func(ev *socketio.EventPayload) { s.onSocketMessageSend(socket, user, ev) })
		socket.On("message:read", func(ev *socketio.EventPayload) { s.onSocketMessageRead(socket, user, ev) })
		socket.On("typing:start", func(ev *socketio.EventPayload) { s.onSocketTyping(socket, user, ev, true) })
		socket.On("typing:stop", func(ev *socketio.EventPayload) { s.onSocketTyping(socket, user, ev, false) })
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
	return s.createMessageWithPayloadContextOptions(ctx, user, chatID, payload, clientMessageID, forwarded, false)
}

// createGeneratedMessageWithPayloadContext creates a durable server-generated
// chat message. It keeps ordinary chat permissions and encryption rules but
// bypasses slow mode so a completed call's notes are never silently dropped.
func (s *Server) createGeneratedMessageWithPayloadContext(ctx context.Context, user userPublic, chatID string, payload sendMessageRequest) (messagePublic, error) {
	return s.createMessageWithPayloadContextOptions(ctx, user, chatID, payload, nil, nil, true)
}

func (s *Server) createMessageWithPayloadContextOptions(ctx context.Context, user userPublic, chatID string, payload sendMessageRequest, clientMessageID *string, forwarded *messageForwardSource, skipMessageDelay bool) (messagePublic, error) {
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return messagePublic{}, errNotFound
	}
	if err := s.validateMessageSendPermissions(ctx, chat, user, &payload); err != nil {
		return messagePublic{}, err
	}
	if !skipMessageDelay {
		if err := s.checkMessageDelay(ctx, chat, user, chatID); err != nil {
			return messagePublic{}, err
		}
	}
	content, encryptionProtocol, ciphertext, nonce, keyVersion, metadata, attachments, messageType, err := s.resolveMessageContent(chat, user, chatID, payload)
	if err != nil {
		return messagePublic{}, err
	}

	onlineRecipients := s.onlineChatRecipients(chat, user.ID)
	messageID := uuid.NewString()
	now := nowString()
	var forwardedMessageID, forwardedChatID *string
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
	brokerEvent := broker.BrokerEvent{
		"event_id":   uuid.NewString(),
		"type":       "message.created",
		"chat_id":    chatID,
		"message_id": message.ID,
		"payload":    toMap(message),
	}
	// Redis fan-out is deliberately off the request path. Once the message is
	// durable, the sender is acknowledged; delivery is then best-effort and
	// tracked separately by receipt statuses.
	go func() {
		if err := s.broker.Publish(context.Background(), brokerChannelMessages, brokerEvent); err != nil {
			s.logger.Warnf("realtime", "broker publish failed channel=%s chat_id=%s error=%v", brokerChannelMessages, chatID, err)
			s.emitMessageNew(chat, message)
		}
	}()
	go s.notifyMessageRecipients(chatID, chat.Type, chat.Title, user.ID, user.DisplayName, truncatePreview(message.Content), payload.MentionedUserIDs)
	return message, nil
}

// validateMessageSendPermissions checks block lists, channel post permissions,
// and reply-target validity. It also normalises the payload's reply/thread fields.
func (s *Server) validateMessageSendPermissions(ctx context.Context, chat chatPublic, user userPublic, payload *sendMessageRequest) error {
	if chat.Type == "direct" {
		for _, member := range chat.Members {
			if member.ID == user.ID {
				continue
			}
			blocked, err := s.directContactBlocked(user.ID, member.ID)
			if err != nil {
				return newStatusError(500, "could not check privacy settings")
			}
			if blocked {
				return newStatusError(403, "direct messages are unavailable for this member")
			}
		}
	}
	canPost := s.canSendToChat(chat, user)
	threadRootMessageID := trimStringPointer(payload.ThreadRootMessageID)
	if !canPost {
		if chat.Type != "channel" || !chat.CommentsEnabled || threadRootMessageID == nil {
			return errForbidden
		}
		if err := s.validateReplyTarget(chat.ID, *threadRootMessageID); err != nil {
			return err
		}
		payload.ThreadRootMessageID = threadRootMessageID
		payload.ReplyToMessageID = nil
		return nil
	}
	if payload.ReplyToMessageID != nil {
		replyToMessageID := trimStringPointer(payload.ReplyToMessageID)
		if replyToMessageID != nil {
			if err := s.validateReplyTarget(chat.ID, *replyToMessageID); err != nil {
				return err
			}
		}
		payload.ReplyToMessageID = replyToMessageID
	}
	if payload.ThreadRootMessageID != nil {
		root := trimStringPointer(payload.ThreadRootMessageID)
		if root == nil {
			payload.ThreadRootMessageID = nil
		} else {
			if err := s.validateReplyTarget(chat.ID, *root); err != nil {
				return err
			}
			payload.ThreadRootMessageID = root
		}
	}
	return nil
}

// checkMessageDelay enforces per-chat slow-mode rate limiting for every human
// sender. Managers configure the setting, but must not silently bypass the
// delay themselves or it appears to switch off as soon as they test it.
func (s *Server) checkMessageDelay(ctx context.Context, chat chatPublic, user userPublic, chatID string) error {
	if chat.MessageDelaySeconds <= 0 {
		return nil
	}
	lastCreatedAt, err := s.store.GetLastUserMessageCreatedAt(ctx, chatID, user.ID)
	if err != nil || lastCreatedAt == "" {
		return nil
	}
	elapsed := time.Since(parseTime(lastCreatedAt))
	requiredDelay := time.Duration(chat.MessageDelaySeconds) * time.Second
	if elapsed < requiredDelay {
		remaining := int((requiredDelay-elapsed+999*time.Millisecond) / time.Second)
		if remaining <= 0 {
			remaining = 1
		}
		return newStatusError(429, fmt.Sprintf("Message delay is active. Please wait %d second(s).", remaining))
	}
	return nil
}

// resolveMessageContent validates and prepares all message content fields:
// text, encryption, attachments, and message type.
func (s *Server) resolveMessageContent(chat chatPublic, user userPublic, chatID string, payload sendMessageRequest) (
	content *string, encryptionProtocol string, ciphertext, nonce *string, keyVersion *int, metadata *string,
	attachments []filePublic, messageType string, err error,
) {
	content = trimStringPointer(payload.Content)
	if content != nil && *content == "" {
		content = nil
	}
	if content != nil && len(*content) > 4000 {
		return nil, "", nil, nil, nil, nil, nil, "", newStatusError(422, "message content is too long")
	}
	encryptionProtocol, ciphertext, nonce, keyVersion, metadata, err = s.prepareMessageEncryption(chat, content, payload)
	if err != nil {
		return nil, "", nil, nil, nil, nil, nil, "", err
	}
	if content == nil && ciphertext == nil && len(payload.FileIDs) == 0 && !payload.AttachmentsPending {
		return nil, "", nil, nil, nil, nil, nil, "", errBadRequest
	}
	attachments, err = s.loadAttachmentsForMessage(payload.FileIDs, user, chatID)
	if err != nil {
		return nil, "", nil, nil, nil, nil, nil, "", err
	}
	messageType = payload.Type
	if messageType == "" {
		messageType = chooseMessageType(content, attachments)
		if payload.AttachmentsPending && len(attachments) == 0 {
			messageType = "mixed"
		}
	}
	if messageType != "text" && messageType != "image" && messageType != "video" && messageType != "file" && messageType != "mixed" {
		return nil, "", nil, nil, nil, nil, nil, "", errBadRequest
	}
	return content, encryptionProtocol, ciphertext, nonce, keyVersion, metadata, attachments, messageType, nil
}

// onlineChatRecipients returns a slice of IDs of chat members (excluding sender) who are currently online.
func (s *Server) onlineChatRecipients(chat chatPublic, senderID string) []string {
	recipients := make([]string, 0)
	for _, member := range chat.Members {
		if member.ID != senderID && s.userOnline(member.ID) {
			recipients = append(recipients, member.ID)
		}
	}
	return recipients
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
		s.logger.Warnf("realtime.call", "emitCallToUser: no sockets for user_id=%s event=%s РІР‚вЂќ queueing", userID, event)
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
	// Explicit config takes priority РІР‚вЂќ fastest and most reliable path.
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
