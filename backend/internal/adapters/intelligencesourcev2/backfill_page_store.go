package intelligencesourcev2

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/google/uuid"
)

type BackfillSnapshot struct {
	ResourceID, RevisionID string
	Metadata []byte
	ObservedAt time.Time
	Protocol string
	Content, Ciphertext, Nonce sql.NullString
}

type BackfillPage struct {
	FenceSequence int64
	HasMore bool
	CreatedAt time.Time
	Snapshots []BackfillSnapshot
}

type backfillMessage struct {
	resourceID, createdAt string
	content, ciphertext, nonce sql.NullString
	keyVersion sql.NullInt64
	protocol string
	metadata []byte
	observedAt time.Time
}

func (s *Store) BuildBackfillPage(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, backfillID string, pageNumber, limit int, now time.Time) (BackfillPage, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return BackfillPage{}, err }
	defer func() { _ = tx.Rollback() }()
	var result BackfillPage
	var nextPage int
	var lastCreatedAt, lastResourceID sql.NullString
	err = tx.QueryRowContext(ctx, `
		SELECT b.fence_sequence,b.next_page,b.last_created_at,b.last_resource_id
		FROM public.intelligence_source_v2_backfills b WHERE b.id=$1 AND b.connection_id=$2 AND b.chat_id=$3 FOR UPDATE`,
		backfillID, identity.ConnectionID, identity.ChatID).Scan(&result.FenceSequence, &nextPage, &lastCreatedAt, &lastResourceID)
	if errors.Is(err, sql.ErrNoRows) { return BackfillPage{}, ErrNotFound }
	if err != nil { return BackfillPage{}, err }
	allowed, err := lockReadScope(ctx, tx, identity, now)
	if err != nil { return BackfillPage{}, err }
	if !allowed { return BackfillPage{}, ErrForbidden }
	if pageNumber > nextPage { return BackfillPage{}, ErrInvalidRequest }
	if pageNumber < nextPage {
		err = tx.QueryRowContext(ctx, `SELECT has_more,created_at FROM public.intelligence_source_v2_backfill_pages WHERE backfill_id=$1 AND page_number=$2`, backfillID, pageNumber).Scan(&result.HasMore, &result.CreatedAt)
		if errors.Is(err, sql.ErrNoRows) { return BackfillPage{}, ErrInvalidRequest }
		if err != nil { return BackfillPage{}, err }
	} else {
		if lastCreatedAt.Valid != lastResourceID.Valid { return BackfillPage{}, ErrUnavailable }
		messages, err := readBackfillMessages(ctx, tx, identity, lastCreatedAt, lastResourceID, limit+1)
		if err != nil { return BackfillPage{}, err }
		result.HasMore = len(messages) > limit
		if result.HasMore { messages = messages[:limit] }
		result.CreatedAt = now
		if _, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_backfill_pages(backfill_id,page_number,has_more,created_at) VALUES($1,$2,$3,$4)`, backfillID, pageNumber, result.HasMore, result.CreatedAt); err != nil { return BackfillPage{}, err }
		for index := range messages {
			if err := insertBackfillSnapshot(ctx, tx, identity, backfillID, pageNumber, index, messages[index]); err != nil { return BackfillPage{}, err }
		}
		if len(messages) > 0 {
			last := messages[len(messages)-1]
			lastCreatedAt, lastResourceID = sql.NullString{String:last.createdAt, Valid:true}, sql.NullString{String:last.resourceID, Valid:true}
		}
		if _, err := tx.ExecContext(ctx, `UPDATE public.intelligence_source_v2_backfills SET next_page=next_page+1,last_created_at=$2,last_resource_id=$3,completed=$4 WHERE id=$1`, backfillID, nullableSQLString(lastCreatedAt), nullableSQLString(lastResourceID), !result.HasMore); err != nil { return BackfillPage{}, err }
	}
	result.Snapshots, err = loadBackfillPage(ctx, tx, backfillID, pageNumber)
	if err != nil { return BackfillPage{}, err }
	if err := tx.Commit(); err != nil { return BackfillPage{}, err }
	return result, nil
}

func readBackfillMessages(ctx context.Context, tx *sql.Tx, identity httptransport.IntelligenceSourceIdentity, lastCreatedAt, lastResourceID sql.NullString, limit int) ([]backfillMessage, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT m.id,m.created_at,m.content,m.ciphertext,m.nonce,m.key_version,m.encryption_protocol,
		       jsonb_build_object('chat_id',m.chat_id,'sender_id',m.sender_id,'message_type',m.type,
		                          'created_at',m.created_at,'updated_at',m.updated_at,'edited',m.is_edited),now()
		FROM public.messages m JOIN public.chats scoped_chat ON scoped_chat.id=m.chat_id AND scoped_chat.encryption_protocol IN ('legacy_plaintext','server_at_rest')
		WHERE m.chat_id=$1 AND m.deleted_at IS NULL AND m.type='text'
		  AND ((m.encryption_protocol='legacy_plaintext' AND m.content IS NOT NULL) OR (m.encryption_protocol='server_at_rest' AND m.ciphertext IS NOT NULL AND m.nonce IS NOT NULL))
		  AND ($2::text IS NULL OR m.created_at>$2 OR (m.created_at=$2 AND m.id>$3))
		  AND NOT EXISTS (SELECT 1 FROM public.message_user_deletions mud WHERE mud.message_id=m.id AND mud.user_id=$4)
		ORDER BY m.created_at,m.id LIMIT $5`, identity.ChatID, nullableSQLString(lastCreatedAt), nullableSQLString(lastResourceID), identity.PrincipalUserID, limit)
	if err != nil { return nil, err }
	defer func() { _ = rows.Close() }()
	messages := make([]backfillMessage, 0, limit)
	for rows.Next() { var message backfillMessage; if err := rows.Scan(&message.resourceID,&message.createdAt,&message.content,&message.ciphertext,&message.nonce,&message.keyVersion,&message.protocol,&message.metadata,&message.observedAt); err != nil { return nil, err }; messages = append(messages,message) }
	if err := rows.Err(); err != nil { return nil, err }
	return messages,nil
}

func insertBackfillSnapshot(ctx context.Context, tx *sql.Tx, identity httptransport.IntelligenceSourceIdentity, backfillID string, pageNumber, itemNumber int, message backfillMessage) error {
	revisionID := uuid.NewString()
	if _, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_revisions(revision_id,connection_id,resource_id,chat_id,encryption_protocol,metadata,deleted,observed_at) VALUES($1,$2,$3,$4,$5,$6,false,$7)`, revisionID,identity.ConnectionID,message.resourceID,identity.ChatID,message.protocol,message.metadata,message.observedAt); err != nil { return err }
	if message.protocol == "legacy_plaintext" {
		if !message.content.Valid { return ErrUnavailable }
		if _, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_revision_payloads(connection_id,revision_id,content) VALUES($1,$2,$3)`, identity.ConnectionID,revisionID,message.content.String); err != nil { return err }
	} else {
		if !message.ciphertext.Valid || !message.nonce.Valid { return ErrUnavailable }
		if _, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_revision_payloads(connection_id,revision_id,ciphertext,nonce,key_version) VALUES($1,$2,$3,$4,$5)`, identity.ConnectionID,revisionID,message.ciphertext.String,message.nonce.String,nullableSQLInt64(message.keyVersion)); err != nil { return err }
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_backfill_items(backfill_id,page_number,item_number,connection_id,resource_id,revision_id,source_created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, backfillID,pageNumber,itemNumber,identity.ConnectionID,message.resourceID,revisionID,message.createdAt)
	return err
}

func loadBackfillPage(ctx context.Context, tx *sql.Tx, backfillID string, pageNumber int) ([]BackfillSnapshot, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT r.resource_id,r.revision_id,r.metadata,r.observed_at,r.encryption_protocol,p.content,p.ciphertext,p.nonce
		FROM public.intelligence_source_v2_backfill_items item
		JOIN public.intelligence_source_v2_revisions r ON r.connection_id=item.connection_id AND r.resource_id=item.resource_id AND r.revision_id=item.revision_id
		JOIN public.intelligence_source_v2_revision_payloads p ON p.connection_id=r.connection_id AND p.revision_id=r.revision_id
		WHERE item.backfill_id=$1 AND item.page_number=$2 ORDER BY item.item_number`, backfillID,pageNumber)
	if err != nil { return nil, err }
	defer func() { _ = rows.Close() }()
	items := make([]BackfillSnapshot, 0)
	for rows.Next() {
		var item BackfillSnapshot
		if err := rows.Scan(&item.ResourceID,&item.RevisionID,&item.Metadata,&item.ObservedAt,&item.Protocol,&item.Content,&item.Ciphertext,&item.Nonce); err != nil { return nil, err }
		var metadata any
		if err := json.Unmarshal(item.Metadata, &metadata); err != nil { return nil, err }
		items = append(items,item)
	}
	if err := rows.Err(); err != nil { return nil, err }
	return items,nil
}

func nullableSQLString(value sql.NullString) any { if !value.Valid { return nil }; return value.String }
func nullableSQLInt64(value sql.NullInt64) any { if !value.Valid { return nil }; return value.Int64 }
