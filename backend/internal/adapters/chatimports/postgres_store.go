package chatimports

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"stovo-messenger/backend/internal/features/chattransfer"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) FindImport(ctx context.Context, userID, idempotencyKey, requestHash string) (chattransfer.ImportResult, bool, error) {
	var result chattransfer.ImportResult
	var storedHash string
	err := s.db.QueryRowContext(ctx, `SELECT chat_id, created_at, request_hash FROM chat_import_batches WHERE imported_by=$1 AND idempotency_key=$2`, userID, idempotencyKey).Scan(&result.ChatID, &result.CreatedAt, &storedHash)
	if errors.Is(err, sql.ErrNoRows) {
		return chattransfer.ImportResult{}, false, nil
	}
	if err != nil {
		return chattransfer.ImportResult{}, false, err
	}
	if storedHash != requestHash {
		return chattransfer.ImportResult{}, false, chattransfer.ErrIdempotencyConflict
	}
	return result, true, nil
}

func (s *PostgresStore) CommitImport(ctx context.Context, commit chattransfer.ImportCommit) (chattransfer.ImportResult, bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return chattransfer.ImportResult{}, false, err
	}
	defer func() { _ = tx.Rollback() }()

	lockKey := commit.ImportingUserID + ":" + commit.IdempotencyKey
	var lockValue string
	if err := tx.QueryRowContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text`, lockKey).Scan(&lockValue); err != nil {
		return chattransfer.ImportResult{}, false, err
	}
	var existing chattransfer.ImportResult
	var existingHash string
	err = tx.QueryRowContext(ctx, `SELECT chat_id, created_at, request_hash FROM chat_import_batches WHERE imported_by=$1 AND idempotency_key=$2`, commit.ImportingUserID, commit.IdempotencyKey).Scan(&existing.ChatID, &existing.CreatedAt, &existingHash)
	if err == nil {
		if existingHash != commit.RequestHash {
			return chattransfer.ImportResult{}, false, chattransfer.ErrIdempotencyConflict
		}
		if err := tx.Commit(); err != nil {
			return chattransfer.ImportResult{}, false, err
		}
		return existing, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return chattransfer.ImportResult{}, false, err
	}

	chat := commit.Chat
	if _, err := tx.ExecContext(ctx, `INSERT INTO chats (id,family_id,type,title,created_by,media_visibility,encryption_protocol,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`, chat.ID, chat.FamilyID, chat.Type, chat.Title, chat.CreatedBy, chat.MediaVisibility, chat.EncryptionProtocol, chat.CreatedAt); err != nil {
		return chattransfer.ImportResult{}, false, err
	}
	for _, memberID := range chat.MemberIDs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO chat_members (chat_id,user_id,created_at) VALUES ($1,$2,$3)`, chat.ID, memberID, chat.CreatedAt); err != nil {
			return chattransfer.ImportResult{}, false, err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO chat_import_batches (id,family_id,imported_by,idempotency_key,request_hash,chat_id,source_provider,source_profile,source_conversation_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,''),$10)`, commit.BatchID, commit.FamilyID, commit.ImportingUserID, commit.IdempotencyKey, commit.RequestHash, chat.ID, commit.SourceProvider, commit.SourceProfile, commit.SourceConversationID, commit.CreatedAt); err != nil {
		return chattransfer.ImportResult{}, false, err
	}

	lastReadID, lastReadAt := "", commit.CreatedAt
	if len(commit.Messages) > 0 {
		lastReadID = commit.Messages[len(commit.Messages)-1].ID
		lastReadAt = commit.Messages[len(commit.Messages)-1].CreatedAt
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO chat_preferences (chat_id,user_id,last_read_message_id,last_read_at) VALUES ($1,$2,NULLIF($3,''),$4)`, chat.ID, commit.ImportingUserID, lastReadID, lastReadAt); err != nil {
		return chattransfer.ImportResult{}, false, err
	}

	for _, file := range commit.Files {
		if _, err := tx.ExecContext(ctx, `INSERT INTO files (id,family_id,uploaded_by,chat_id,access_scope,storage_provider,object_key,original_name,mime_type,size_bytes,checksum,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, file.ID, file.FamilyID, file.UploadedBy, file.ChatID, file.AccessScope, file.StorageProvider, file.ObjectKey, file.OriginalName, file.MIMEType, file.Size, file.Checksum, file.CreatedAt); err != nil {
			return chattransfer.ImportResult{}, false, err
		}
	}
	for _, message := range commit.Messages {
		if _, err := tx.ExecContext(ctx, `INSERT INTO messages (id,chat_id,sender_id,type,content,encryption_protocol,ciphertext,nonce,encryption_metadata,reply_to_message_id,thread_root_message_id,message_kind,created_at,updated_at,is_edited) VALUES ($1,$2,$3,$4,NULLIF($5,''),$6,$7,$8,$9,NULL,NULL,$10,$11,$12,$13)`, message.ID, chat.ID, message.SenderID, message.Type, message.Content, message.EncryptionProtocol, message.Ciphertext, message.Nonce, message.EncryptionMetadata, message.MessageKind, message.CreatedAt, message.UpdatedAt, message.IsEdited); err != nil {
			return chattransfer.ImportResult{}, false, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO message_import_attributions (message_id,import_batch_id,source_message_id,source_author_id,source_author_name,source_reactions,source_metadata,source_attachments,source_deleted_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)`, message.ID, commit.BatchID, message.SourceMessageID, message.SourceAuthorID, message.SourceAuthorName, []byte(message.SourceReactions), []byte(message.SourceMetadata), []byte(message.SourceAttachments), message.SourceDeletedAt); err != nil {
			return chattransfer.ImportResult{}, false, err
		}
		for _, fileID := range message.AttachmentFileIDs {
			if _, err := tx.ExecContext(ctx, `INSERT INTO message_attachments (message_id,file_id) VALUES ($1,$2)`, message.ID, fileID); err != nil {
				return chattransfer.ImportResult{}, false, err
			}
		}
	}
	for _, message := range commit.Messages {
		if message.ReplyToMessageID != nil {
			if _, err := tx.ExecContext(ctx, `UPDATE messages SET reply_to_message_id=$2 WHERE id=$1`, message.ID, *message.ReplyToMessageID); err != nil {
				return chattransfer.ImportResult{}, false, err
			}
		}
		if message.ThreadRootMessageID != nil {
			if _, err := tx.ExecContext(ctx, `UPDATE messages SET thread_root_message_id=$2 WHERE id=$1`, message.ID, *message.ThreadRootMessageID); err != nil {
				return chattransfer.ImportResult{}, false, err
			}
		}
	}
	if len(commit.Messages) > 0 {
		if _, err := tx.ExecContext(ctx, `UPDATE chats SET updated_at=$2 WHERE id=$1`, chat.ID, commit.Messages[len(commit.Messages)-1].CreatedAt); err != nil {
			return chattransfer.ImportResult{}, false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return chattransfer.ImportResult{}, false, fmt.Errorf("commit chat import: %w", err)
	}
	return chattransfer.ImportResult{ChatID: chat.ID, CreatedAt: commit.CreatedAt}, true, nil
}

var _ chattransfer.ImportStore = (*PostgresStore)(nil)
