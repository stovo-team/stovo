package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"stovo-messenger/backend/internal/domain"
	"stovo-messenger/backend/internal/features/messages"
	featuresync "stovo-messenger/backend/internal/features/sync"
	"stovo-messenger/backend/internal/plugins"
	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/google/uuid"
)

const (
	clientOperationHeader = "X-Stovo-Operation-Id"
)

func (s *Server) syncHandler(user userPublic) httptransport.SyncHandler {
	return httptransport.NewSyncHandler(httptransport.SyncOperations{
		Page: func(ctx context.Context, cursor, limit string) (any, error) {
			page, err := s.sync.Page(ctx, featuresync.Actor{FamilyID: user.FamilyID, UserID: user.ID}, cursor, limit)
			if err != nil {
				return nil, err
			}
			response := httptransport.SyncResponse{Events: make([]httptransport.SyncEventResponse, 0, len(page.Events)), HasMore: page.HasMore}
			for _, event := range page.Events {
				response.Events = append(response.Events, httptransport.SyncEventResponse{
					Sequence:      event.Sequence,
					EventID:       event.ID,
					Type:          event.Type,
					Version:       event.Version,
					AggregateType: event.AggregateType,
					AggregateID:   event.AggregateID,
					Payload:       append(json.RawMessage(nil), event.Payload...),
					OccurredAt:    event.OccurredAt,
				})
			}
			if page.NextCursor != "" {
				response.NextCursor = &page.NextCursor
			}
			return response, nil
		},
		InvalidCursor: featuresync.ErrInvalidCursor,
		InvalidLimit:  featuresync.ErrInvalidLimit,
		LogFailure:    func(err error) { s.logger.Warnf("sync", "query failed user_id=%s error=%v", user.ID, err) },
	})
}

// handleSync serves the authoritative, replayable device delta. Events whose
// audience is "family" are visible to every current family member; an event
// whose audience is "recipients" is visible only through its recipient rows.
func (s *Server) handleSync(w http.ResponseWriter, r *http.Request, user userPublic) {
	s.syncHandler(user).ServeHTTP(w, r)
}

// createRESTMessageWithSync keeps a REST message, its client-sync event, and
// optional idempotency result in one PostgreSQL transaction. Socket.IO sends
// still use the existing path until their own operation contract is migrated.
func (s *Server) createRESTMessageWithSync(ctx context.Context, user userPublic, chatID string, payload sendMessageRequest, operationID string) (messagePublic, bool, error) {
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return messagePublic{}, false, errNotFound
	}
	if err := s.validateMessageSendPermissions(ctx, chat, user, &payload); err != nil {
		return messagePublic{}, false, err
	}
	if err := s.checkMessageDelay(ctx, chat, user, chatID); err != nil {
		return messagePublic{}, false, err
	}
	content, encryptionProtocol, ciphertext, nonce, keyVersion, metadata, attachments, messageType, err := s.resolveMessageContent(chat, user, chatID, payload)
	if err != nil {
		return messagePublic{}, false, err
	}

	requestHash, err := messageOperationHash(chatID, payload)
	if err != nil {
		return messagePublic{}, false, err
	}
	now := nowString()
	createdAt := parseTime(now)
	messageID := uuid.NewString()
	messageKind := "chat"
	if payload.ThreadRootMessageID != nil {
		messageKind = "thread"
	}
	onlineRecipients := s.onlineChatRecipients(chat, user.ID)
	message := newCreatedMessagePublic(messageID, chatID, user, messageType, content, encryptionProtocol, ciphertext, nonce, keyVersion, metadata, payload, messageKind, attachments, onlineRecipients, createdAt)
	if payload.CollectionID != nil {
		card, err := s.shareCollectionWithChat(ctx, strings.TrimSpace(*payload.CollectionID), chat, user)
		if err != nil {
			return messagePublic{}, false, err
		}
		message.Collection = &card
	}
	// Echo the client operation ID in the durable response and sync event.  The
	// client uses it to replace its optimistic outbox item with this server
	// message, including when the REST response itself was interrupted.
	if operationID != "" {
		message.ClientMessageID = &operationID
	}

	payloadJSON, err := json.Marshal(message)
	if err != nil {
		return messagePublic{}, false, err
	}
	attachmentIDs := make([]string, 0, len(message.Attachments))
	for _, attachment := range message.Attachments {
		attachmentIDs = append(attachmentIDs, attachment.ID)
	}
	result, err := s.messageSync.Create(ctx, messages.CreateSyncedMessage{
		ActorID:            user.ID,
		FamilyID:           user.FamilyID,
		ChatID:             chatID,
		OperationID:        operationID,
		RequestHash:        requestHash,
		OnlineRecipientIDs: onlineRecipients,
		RecipientIDs:       syncRecipientIDs(chat.Members, user.ID),
		ResponsePayload:    payloadJSON,
		Message: messages.SyncedMessage{
			ID: message.ID, ChatID: chatID, SenderID: user.ID, Type: message.Type, Content: message.Content,
			EncryptionProtocol: encryptionProtocol, Ciphertext: ciphertext, Nonce: nonce, KeyVersion: keyVersion,
			EncryptionMetadata: metadata, ReplyToMessageID: payload.ReplyToMessageID,
			ThreadRootMessageID: payload.ThreadRootMessageID, MessageKind: messageKind, AttachmentIDs: attachmentIDs,
			CreatedAt: createdAt,
		},
	})
	if err != nil {
		if errors.Is(err, messages.ErrOperationConflict) || errors.Is(err, messages.ErrOperationProcessing) {
			return messagePublic{}, false, newStatusError(http.StatusConflict, err.Error())
		}
		return messagePublic{}, false, err
	}
	if result.Replayed {
		if err := json.Unmarshal(result.ResponsePayload, &message); err != nil {
			return messagePublic{}, false, fmt.Errorf("decode stored operation response: %w", err)
		}
	}
	if payload.CollectionID != nil {
		if err := s.recordMessageCollectionCard(ctx, message.ID, strings.TrimSpace(*payload.CollectionID)); err != nil {
			return messagePublic{}, false, err
		}
	}
	return message, result.Replayed, nil
}

func messageOperationHash(chatID string, payload sendMessageRequest) (string, error) {
	canonical, err := json.Marshal(struct {
		ChatID  string             `json:"chatId"`
		Payload sendMessageRequest `json:"payload"`
	}{ChatID: chatID, Payload: payload})
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:]), nil
}

// syncRecipientIDs returns each chat member once and always includes the
// sender. The latter is intentional: an author's other devices must receive
// the same durable event as every recipient.
func syncRecipientIDs(members []chatMemberPublic, senderID string) []string {
	seen := make(map[string]struct{}, len(members)+1)
	ids := make([]string, 0, len(members)+1)
	add := func(userID string) {
		userID = strings.TrimSpace(userID)
		if userID == "" {
			return
		}
		if _, exists := seen[userID]; exists {
			return
		}
		seen[userID] = struct{}{}
		ids = append(ids, userID)
	}
	for _, member := range members {
		add(member.ID)
	}
	add(senderID)
	return ids
}

func newCreatedMessagePublic(id, chatID string, user userPublic, messageType string, content *string, encryptionProtocol string, ciphertext, nonce *string, keyVersion *int, metadata *string, request sendMessageRequest, messageKind string, attachments []filePublic, onlineRecipients []string, createdAt time.Time) messagePublic {
	name := user.DisplayName
	message := messagePublic{
		ID:                  id,
		ChatID:              chatID,
		SenderID:            user.ID,
		SenderDisplayName:   &name,
		Type:                messageType,
		Content:             content,
		EncryptionProtocol:  encryptionProtocol,
		Ciphertext:          ciphertext,
		Nonce:               nonce,
		KeyVersion:          keyVersion,
		EncryptionMetadata:  metadata,
		ReplyToMessageID:    request.ReplyToMessageID,
		ThreadRootMessageID: request.ThreadRootMessageID,
		MessageKind:         messageKind,
		CreatedAt:           createdAt,
		UpdatedAt:           createdAt,
		Statuses: []messageStatusPublic{{
			UserID: user.ID, Status: "sent", CreatedAt: createdAt,
		}},
		Reactions: make([]messageReactionPublic, 0),
		// Message JSON is a client contract: an empty attachment list must be
		// encoded as [] rather than null. Some older records have no attachments
		// and a null here makes frontend consumers that iterate the list crash.
		Attachments: append(make([]filePublic, 0, len(attachments)), attachments...),
	}
	if encryptionProtocol == encryptionProtocolServerAtRest {
		message.Ciphertext = nil
		message.Nonce = nil
		message.EncryptionMetadata = nil
	}
	for _, recipientID := range onlineRecipients {
		message.Statuses = append(message.Statuses, messageStatusPublic{UserID: recipientID, Status: "delivered", CreatedAt: createdAt})
	}
	return message
}

func (s *Server) notifyCreatedRESTMessage(chat chatPublic, user userPublic, message messagePublic, request sendMessageRequest) {
	delivery := messages.NewDeliveryService(newMessageDeliveryAdapter(s))
	createdEvent := domain.MessageCreated{EventID: uuid.NewString(), ChatID: message.ChatID, MessageID: message.ID, Payload: toMap(message)}
	notification := domain.MessageNotification{
		ChatID: message.ChatID, ChatType: chat.Type, ChatTitle: chat.Title, SenderID: user.ID,
		SenderName: user.DisplayName, Preview: truncatePreview(message.Content), MentionedUserIDs: request.MentionedUserIDs,
	}
	go func() {
		if err := delivery.PublishCreated(context.Background(), createdEvent); err != nil {
			s.logger.Warnf("realtime", "broker publish failed channel=%s chat_id=%s error=%v", brokerChannelMessages, message.ChatID, err)
			s.emitMessageNew(chat, message)
		}
	}()
	go delivery.NotifyRecipients(context.Background(), notification)
	if s.eventBus != nil {
		contentStr := ""
		if message.Content != nil {
			contentStr = *message.Content
		}
		s.eventBus.Publish(context.Background(), plugins.Event{
			Type:      plugins.EventMessageSent,
			Timestamp: message.CreatedAt,
			Payload: map[string]interface{}{
				"message_id": message.ID,
				"chat_id":    message.ChatID,
				"sender_id":  user.ID,
				"type":       message.Type,
				"content":    contentStr,
			},
		})
	}
}
