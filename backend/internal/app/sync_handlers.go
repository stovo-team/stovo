package app

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"stovo-messenger/backend/internal/domain"
	"stovo-messenger/backend/internal/features/messages"

	"github.com/google/uuid"
)

const (
	clientOperationHeader = "X-Stovo-Operation-Id"
	defaultSyncPageSize   = 100
	maxSyncPageSize       = 500
)

type syncEventResponse struct {
	Sequence      int64           `json:"sequence"`
	EventID       string          `json:"eventId"`
	Type          string          `json:"type"`
	Version       int             `json:"version"`
	AggregateType string          `json:"aggregateType"`
	AggregateID   string          `json:"aggregateId"`
	Payload       json.RawMessage `json:"payload"`
	OccurredAt    time.Time       `json:"occurredAt"`
}

type syncResponse struct {
	Events     []syncEventResponse `json:"events"`
	NextCursor *string             `json:"nextCursor"`
	HasMore    bool                `json:"hasMore"`
}

// handleSync serves the authoritative, replayable device delta. Events whose
// audience is "family" are visible to every current family member; an event
// whose audience is "recipients" is visible only through its recipient rows.
func (s *Server) handleSync(w http.ResponseWriter, r *http.Request, user userPublic) {
	rawCursor := strings.TrimSpace(r.URL.Query().Get("cursor"))
	cursor, err := s.parseSyncCursor(rawCursor, user)
	if err != nil {
		s.detail(w, http.StatusBadRequest, "Invalid sync cursor")
		return
	}
	limit, err := parseSyncLimit(r.URL.Query().Get("limit"))
	if err != nil {
		s.detail(w, http.StatusBadRequest, "Invalid sync limit")
		return
	}

	rows, err := s.db.QueryContext(r.Context(), `
		SELECT e.sequence, e.id, e.event_type, e.schema_version,
		       e.aggregate_type, e.aggregate_id, e.payload, e.occurred_at
		FROM sync_events e
		WHERE e.family_id = $1
		  AND e.sequence > $2
		  AND (
		      e.audience = 'family'
		      OR EXISTS (
		          SELECT 1 FROM sync_event_recipients r
		          WHERE r.event_id = e.id AND r.user_id = $3
		      )
	  )
		ORDER BY e.sequence ASC
		LIMIT $4`, user.FamilyID, cursor, user.ID, limit+1)
	if err != nil {
		s.logger.Warnf("sync", "query failed user_id=%s error=%v", user.ID, err)
		s.detail(w, http.StatusInternalServerError, "Could not synchronize")
		return
	}
	defer rows.Close()

	response := syncResponse{Events: make([]syncEventResponse, 0, limit)}
	for rows.Next() {
		var event syncEventResponse
		var payload []byte
		if err := rows.Scan(&event.Sequence, &event.EventID, &event.Type, &event.Version,
			&event.AggregateType, &event.AggregateID, &payload, &event.OccurredAt); err != nil {
			s.logger.Warnf("sync", "scan failed user_id=%s error=%v", user.ID, err)
			s.detail(w, http.StatusInternalServerError, "Could not synchronize")
			return
		}
		event.Payload = append(json.RawMessage(nil), payload...)
		response.Events = append(response.Events, event)
	}
	if err := rows.Err(); err != nil {
		s.logger.Warnf("sync", "iteration failed user_id=%s error=%v", user.ID, err)
		s.detail(w, http.StatusInternalServerError, "Could not synchronize")
		return
	}
	if len(response.Events) > limit {
		response.HasMore = true
		response.Events = response.Events[:limit]
	}
	if rawCursor != "" {
		response.NextCursor = &rawCursor
	}
	if len(response.Events) > 0 {
		next := s.encodeSyncCursor(user, response.Events[len(response.Events)-1].Sequence)
		response.NextCursor = &next
	} else if rawCursor == "" {
		// A clean first sync still needs a durable high-water mark; otherwise a
		// device with no currently visible events repeatedly scans its history.
		var sequence int64
		if err := s.db.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(sequence), 0) FROM sync_events WHERE family_id=$1`, user.FamilyID).Scan(&sequence); err == nil {
			next := s.encodeSyncCursor(user, sequence)
			response.NextCursor = &next
		}
	}
	s.json(w, http.StatusOK, response)
}

func (s *Server) parseSyncCursor(raw string, user userPublic) (int64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, nil
	}
	parts := strings.Split(raw, ".")
	if len(parts) != 2 {
		return 0, errors.New("invalid cursor")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return 0, errors.New("invalid cursor")
	}
	mac := hmac.New(sha256.New, []byte(s.cfg.JWTSecret))
	_, _ = mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(parts[1])) {
		return 0, errors.New("invalid cursor")
	}
	fields := strings.Split(string(payload), "\n")
	if len(fields) != 3 || fields[0] != user.FamilyID || fields[1] != user.ID {
		return 0, errors.New("invalid cursor")
	}
	value, err := strconv.ParseInt(fields[2], 10, 64)
	if err != nil || value < 0 {
		return 0, errors.New("invalid cursor")
	}
	return value, nil
}

func (s *Server) encodeSyncCursor(user userPublic, sequence int64) string {
	payload := []byte(fmt.Sprintf("%s\n%s\n%d", user.FamilyID, user.ID, sequence))
	mac := hmac.New(sha256.New, []byte(s.cfg.JWTSecret))
	_, _ = mac.Write(payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + hex.EncodeToString(mac.Sum(nil))
}

func parseSyncLimit(raw string) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return defaultSyncPageSize, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 || value > maxSyncPageSize {
		return 0, errors.New("invalid limit")
	}
	return value, nil
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

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return messagePublic{}, false, err
	}
	defer func() { _ = tx.Rollback() }()

	if operationID != "" {
		replayed, found, err := claimClientOperation(ctx, tx, user.ID, operationID, requestHash)
		if err != nil {
			return messagePublic{}, false, err
		}
		if found {
			return replayed, true, nil
		}
	}

	if err := insertMessageBundleTx(ctx, tx, message, user.ID, chatID, payload, messageKind, encryptionProtocol, ciphertext, nonce, keyVersion, metadata, now, onlineRecipients); err != nil {
		return messagePublic{}, false, err
	}
	payloadJSON, err := json.Marshal(message)
	if err != nil {
		return messagePublic{}, false, err
	}
	recipientIDs := syncRecipientIDs(chat.Members, user.ID)
	syncEventID, _, err := writeSyncEventTx(ctx, tx, user.FamilyID, "recipients", recipientIDs, "message.created", "message", message.ID, payloadJSON)
	if err != nil {
		return messagePublic{}, false, err
	}
	if err := writeOutboxEventTx(ctx, tx, syncEventID, user.FamilyID, "message.created", chatID, payloadJSON); err != nil {
		return messagePublic{}, false, err
	}
	if operationID != "" {
		if _, err := tx.ExecContext(ctx, `
			UPDATE client_operations
			SET response_status=$1, response_body=$2::jsonb
			WHERE actor_user_id=$3 AND operation_id=$4`, http.StatusCreated, payloadJSON, user.ID, operationID); err != nil {
			return messagePublic{}, false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return messagePublic{}, false, err
	}
	return message, false, nil
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

// claimClientOperation either creates an uncommitted claim for this short
// transaction or returns the response recorded by a prior committed request.
func claimClientOperation(ctx context.Context, tx *sql.Tx, actorUserID, operationID, requestHash string) (messagePublic, bool, error) {
	var inserted string
	err := tx.QueryRowContext(ctx, `
		INSERT INTO client_operations
			(actor_user_id, operation_id, operation_type, request_hash, response_status, response_body, expires_at)
		VALUES ($1, $2, 'message.create', $3, 102, '{}'::jsonb, now() + interval '365 days')
		ON CONFLICT (actor_user_id, operation_id) DO NOTHING
		RETURNING operation_id`, actorUserID, operationID, requestHash).Scan(&inserted)
	if err == nil {
		return messagePublic{}, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return messagePublic{}, false, err
	}

	var storedHash string
	var status int
	var response []byte
	err = tx.QueryRowContext(ctx, `
		SELECT request_hash, response_status, response_body
		FROM client_operations
		WHERE actor_user_id=$1 AND operation_id=$2
		FOR UPDATE`, actorUserID, operationID).Scan(&storedHash, &status, &response)
	if err != nil {
		return messagePublic{}, false, err
	}
	if storedHash != requestHash {
		return messagePublic{}, false, newStatusError(http.StatusConflict, "Operation ID was already used with a different request")
	}
	if status == http.StatusProcessing {
		return messagePublic{}, false, newStatusError(http.StatusConflict, "Operation is still processing")
	}
	var message messagePublic
	if err := json.Unmarshal(response, &message); err != nil {
		return messagePublic{}, false, fmt.Errorf("decode stored operation response: %w", err)
	}
	return message, true, nil
}

func insertMessageBundleTx(ctx context.Context, tx *sql.Tx, message messagePublic, senderID, chatID string, request sendMessageRequest, messageKind, encryptionProtocol string, ciphertext, nonce *string, keyVersion *int, metadata *string, now string, onlineRecipients []string) error {
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO messages (
			id, chat_id, sender_id, type, content, encryption_protocol, ciphertext, nonce,
			key_version, encryption_metadata, reply_to_message_id, thread_root_message_id,
			message_kind, created_at, updated_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
		)`, message.ID, chatID, senderID, message.Type, message.Content, encryptionProtocol, ciphertext, nonce,
		keyVersion, metadata, request.ReplyToMessageID, request.ThreadRootMessageID, messageKind, now, now); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO message_statuses (message_id, user_id, status, created_at)
		VALUES ($1, $2, 'sent', $3)`, message.ID, senderID, now); err != nil {
		return err
	}
	for _, attachment := range message.Attachments {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO message_attachments (message_id, file_id) VALUES ($1, $2)
			ON CONFLICT (message_id, file_id) DO NOTHING`, message.ID, attachment.ID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE chats SET updated_at=$1 WHERE id=$2`, now, chatID); err != nil {
		return err
	}
	for _, recipientID := range onlineRecipients {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO message_statuses (message_id, user_id, status, created_at)
			VALUES ($1, $2, 'delivered', $3)
			ON CONFLICT (message_id, user_id, status) DO NOTHING`, message.ID, recipientID, now); err != nil {
			return err
		}
	}
	return nil
}

func writeSyncEventTx(ctx context.Context, tx *sql.Tx, familyID, audience string, recipientIDs []string, eventType, aggregateType, aggregateID string, payload []byte) (string, int64, error) {
	eventID := uuid.NewString()
	var sequence int64
	err := tx.QueryRowContext(ctx, `
		INSERT INTO sync_events
			(id, family_id, audience, event_type, schema_version, aggregate_type, aggregate_id, payload)
		VALUES ($1, $2, $3, $4, 1, $5, $6, $7::jsonb)
		RETURNING sequence`, eventID, familyID, audience, eventType, aggregateType, aggregateID, payload).Scan(&sequence)
	if err != nil {
		return "", 0, err
	}
	if audience != "recipients" {
		return eventID, sequence, nil
	}
	seen := make(map[string]struct{}, len(recipientIDs))
	for _, userID := range recipientIDs {
		if userID == "" {
			continue
		}
		if _, duplicate := seen[userID]; duplicate {
			continue
		}
		seen[userID] = struct{}{}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO sync_event_recipients (event_id, user_id)
			VALUES ($1, $2)
			ON CONFLICT (event_id, user_id) DO NOTHING`, eventID, userID); err != nil {
			return "", 0, err
		}
	}
	return eventID, sequence, nil
}

// writeOutboxEventTx makes background work durable with its source mutation.
// Dispatchers may publish this record to Redis Streams more than once; workers
// must use consumer_receipts keyed by this immutable event ID.
func writeOutboxEventTx(ctx context.Context, tx *sql.Tx, syncEventID, familyID, topic, partitionKey string, payload []byte) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO outbox_events (id, sync_event_id, family_id, topic, schema_version, partition_key, payload)
		VALUES ($1, $2, $3, $4, 1, $5, $6::jsonb)`,
		uuid.NewString(), syncEventID, familyID, topic, partitionKey, payload)
	return err
}

// writeFileSyncEventTx keeps Storage metadata changes ordered with their source
// mutation. Payloads intentionally contain only an opaque file ID; each device
// then loads the current, viewer-specific representation through /api/files/{id}.
func writeFileSyncEventTx(ctx context.Context, tx *sql.Tx, familyID string, chatID *string, eventType, fileID string) error {
	recipients, err := syncRecipientIDsForChatTx(ctx, tx, familyID, chatID)
	if err != nil {
		return err
	}
	return writeFileSyncEventForRecipientsTx(ctx, tx, familyID, recipients, eventType, fileID)
}

func writeFileSyncEventForRecipientsTx(ctx context.Context, tx *sql.Tx, familyID string, recipients []string, eventType, fileID string) error {
	payload, err := json.Marshal(map[string]string{"fileId": fileID})
	if err != nil {
		return err
	}
	syncEventID, _, err := writeSyncEventTx(ctx, tx, familyID, "recipients", recipients, eventType, "file", fileID, payload)
	if err != nil {
		return err
	}
	return writeOutboxEventTx(ctx, tx, syncEventID, familyID, eventType, fileID, payload)
}

func syncRecipientIDsForChatTx(ctx context.Context, tx *sql.Tx, familyID string, chatID *string) ([]string, error) {
	query := `SELECT id FROM users WHERE family_id=$1 AND is_active=1`
	args := []any{familyID}
	if chatID != nil && strings.TrimSpace(*chatID) != "" {
		query = `SELECT cm.user_id FROM chat_members cm JOIN users u ON u.id=cm.user_id WHERE cm.chat_id=$1 AND u.is_active=1`
		args = []any{*chatID}
	}
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	recipients := make([]string, 0)
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		recipients = append(recipients, userID)
	}
	return recipients, rows.Err()
}

func writeMessageChangedSyncEventTx(ctx context.Context, tx *sql.Tx, familyID, chatID, messageID string) error {
	recipients, err := syncRecipientIDsForChatTx(ctx, tx, familyID, &chatID)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(map[string]string{"messageId": messageID, "chatId": chatID})
	if err != nil {
		return err
	}
	syncEventID, _, err := writeSyncEventTx(ctx, tx, familyID, "recipients", recipients, "message.changed", "message", messageID, payload)
	if err != nil {
		return err
	}
	return writeOutboxEventTx(ctx, tx, syncEventID, familyID, "message.changed", chatID, payload)
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
		Reactions:   make([]messageReactionPublic, 0),
		Attachments: append([]filePublic(nil), attachments...),
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
}
