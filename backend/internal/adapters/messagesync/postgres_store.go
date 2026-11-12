// Package messagesync implements the atomic REST-message mutation boundary.
package messagesync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/google/uuid"

	featuremessages "stovo-messenger/backend/internal/features/messages"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) CreateSyncedMessage(ctx context.Context, command featuremessages.CreateSyncedMessage) (featuremessages.CreateSyncedMessageResult, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return featuremessages.CreateSyncedMessageResult{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if command.OperationID != "" {
		response, found, err := claim(ctx, tx, command.ActorID, command.OperationID, command.RequestHash)
		if err != nil {
			return featuremessages.CreateSyncedMessageResult{}, err
		}
		if found {
			return featuremessages.CreateSyncedMessageResult{ResponsePayload: response, Replayed: true}, nil
		}
	}
	if err := insertMessage(ctx, tx, command); err != nil {
		return featuremessages.CreateSyncedMessageResult{}, err
	}
	message := command.Message
	if message.SourceConnectionID != "" || message.SourceOperationID != "" || message.SourceOrigin != "" {
		if message.SourceConnectionID == "" || message.SourceOperationID == "" || message.SourceOrigin != "local_codex_bridge" || message.SourceRevision != 1 || len(message.SourceContentHash) != 32 {
			return featuremessages.CreateSyncedMessageResult{}, errors.New("invalid server source origin")
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_reply_origins(connection_id,operation_id,message_id,origin,revision,content_hash,final,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, message.SourceConnectionID, message.SourceOperationID, message.ID, message.SourceOrigin, message.SourceRevision, message.SourceContentHash, message.SourceFinal, message.CreatedAt); err != nil {
			return featuremessages.CreateSyncedMessageResult{}, err
		}
	}
	eventID, err := writeEvent(ctx, tx, command.FamilyID, command.RecipientIDs, command.Message.ID, command.ResponsePayload)
	if err != nil {
		return featuremessages.CreateSyncedMessageResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO outbox_events (id, sync_event_id, family_id, topic, schema_version, partition_key, payload) VALUES ($1,$2,$3,'message.created',1,$4,$5::jsonb)`, uuid.NewString(), eventID, command.FamilyID, command.ChatID, command.ResponsePayload); err != nil {
		return featuremessages.CreateSyncedMessageResult{}, err
	}
	if command.OperationID != "" {
		if _, err := tx.ExecContext(ctx, `UPDATE client_operations SET response_status=$1, response_body=$2::jsonb WHERE actor_user_id=$3 AND operation_id=$4`, http.StatusCreated, command.ResponsePayload, command.ActorID, command.OperationID); err != nil {
			return featuremessages.CreateSyncedMessageResult{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return featuremessages.CreateSyncedMessageResult{}, err
	}
	return featuremessages.CreateSyncedMessageResult{ResponsePayload: append([]byte(nil), command.ResponsePayload...)}, nil
}

func claim(ctx context.Context, tx *sql.Tx, actorID, operationID, requestHash string) ([]byte, bool, error) {
	var inserted string
	err := tx.QueryRowContext(ctx, `INSERT INTO client_operations (actor_user_id, operation_id, operation_type, request_hash, response_status, response_body, created_at, expires_at) VALUES ($1,$2,'message.create',$3,102,'{}'::jsonb,now(),now() + interval '365 days') ON CONFLICT (actor_user_id, operation_id) DO NOTHING RETURNING operation_id`, actorID, operationID, requestHash).Scan(&inserted)
	if err == nil {
		return nil, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	var storedHash string
	var status int
	var response []byte
	if err := tx.QueryRowContext(ctx, `SELECT request_hash, response_status, response_body FROM client_operations WHERE actor_user_id=$1 AND operation_id=$2 FOR UPDATE`, actorID, operationID).Scan(&storedHash, &status, &response); err != nil {
		return nil, false, err
	}
	if storedHash != requestHash {
		return nil, false, featuremessages.ErrOperationConflict
	}
	if status == http.StatusProcessing {
		return nil, false, featuremessages.ErrOperationProcessing
	}
	if !json.Valid(response) {
		return nil, false, fmt.Errorf("stored operation response is invalid JSON")
	}
	return response, true, nil
}

func insertMessage(ctx context.Context, tx *sql.Tx, command featuremessages.CreateSyncedMessage) error {
	m := command.Message
	if _, err := tx.ExecContext(ctx, `INSERT INTO messages (id,chat_id,sender_id,type,content,encryption_protocol,ciphertext,nonce,key_version,encryption_metadata,reply_to_message_id,thread_root_message_id,message_kind,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`, m.ID, m.ChatID, m.SenderID, m.Type, m.Content, m.EncryptionProtocol, m.Ciphertext, m.Nonce, m.KeyVersion, m.EncryptionMetadata, m.ReplyToMessageID, m.ThreadRootMessageID, m.MessageKind, m.CreatedAt); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO message_statuses (message_id,user_id,status,created_at) VALUES ($1,$2,'sent',$3)`, m.ID, m.SenderID, m.CreatedAt); err != nil {
		return err
	}
	for _, fileID := range m.AttachmentIDs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO message_attachments (message_id,file_id) VALUES ($1,$2) ON CONFLICT (message_id,file_id) DO NOTHING`, m.ID, fileID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE chats SET updated_at=$1 WHERE id=$2`, m.CreatedAt, m.ChatID); err != nil {
		return err
	}
	for _, recipientID := range command.OnlineRecipientIDs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO message_statuses (message_id,user_id,status,created_at) VALUES ($1,$2,'delivered',$3) ON CONFLICT (message_id,user_id,status) DO NOTHING`, m.ID, recipientID, m.CreatedAt); err != nil {
			return err
		}
	}
	return nil
}

func writeEvent(ctx context.Context, tx *sql.Tx, familyID string, recipients []string, messageID string, payload []byte) (string, error) {
	eventID := uuid.NewString()
	var sequence int64
	if err := tx.QueryRowContext(ctx, `INSERT INTO sync_events (id,family_id,audience,event_type,schema_version,aggregate_type,aggregate_id,payload) VALUES ($1,$2,'recipients','message.created',1,'message',$3,$4::jsonb) RETURNING sequence`, eventID, familyID, messageID, payload).Scan(&sequence); err != nil {
		return "", err
	}
	seen := map[string]struct{}{}
	for _, id := range recipients {
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		if _, err := tx.ExecContext(ctx, `INSERT INTO sync_event_recipients (event_id,user_id) VALUES ($1,$2) ON CONFLICT (event_id,user_id) DO NOTHING`, eventID, id); err != nil {
			return "", err
		}
	}
	return eventID, nil
}
