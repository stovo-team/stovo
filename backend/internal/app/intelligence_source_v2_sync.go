package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/google/uuid"
)

const intelligenceSourceV2CursorTTL = 7 * 24 * time.Hour
const intelligenceSourceV2SnapshotPageLimit = 100

type intelligenceSourceV2Cursor struct {
	Kind         string `json:"k"`
	ConnectionID string `json:"c"`
	ChatID       string `json:"h"`
	BackfillID   string `json:"b"`
	Page         int    `json:"p"`
	Sequence     int64  `json:"s"`
	IssuedAt     int64  `json:"i"`
}

type sourceV2QueryRower interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

type sourceV2BackfillMessage struct {
	resourceID string
	createdAt  string
	content    sql.NullString
	ciphertext sql.NullString
	nonce      sql.NullString
	keyVersion sql.NullInt64
	protocol   string
	metadata   []byte
	observedAt time.Time
}

func (s *Server) intelligenceSourceV2StartBackfill(ctx context.Context, identity httptransport.IntelligenceSourceIdentity) (httptransport.IntelligenceSourceV2BackfillStart, error) {
	if s.sqlDB == nil || s.cfg.JWTSecret == "" {
		return httptransport.IntelligenceSourceV2BackfillStart{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	now := s.intelligenceOIDCNow()
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.IntelligenceSourceV2BackfillStart{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	var fenceSequence int64
	err = tx.QueryRowContext(ctx, `
		SELECT c.next_sequence-1
		FROM public.intelligence_source_v2_connections c
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled
		JOIN public.users u ON u.id=c.principal_user_id AND u.is_active=1 AND u.family_id=i.family_id
		JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=$6
		JOIN public.chats ch ON ch.id=scope.chat_id AND ch.family_id=i.family_id
		  AND ch.encryption_protocol IN ('legacy_plaintext','server_at_rest')
		JOIN public.chat_members cm ON cm.chat_id=ch.id AND cm.user_id=u.id
		JOIN public.intelligence_source_v2_connection_grants read_grant
		  ON read_grant.connection_id=c.id AND read_grant.grant_type='read' AND read_grant.granted
		WHERE c.id=$1 AND c.installation_id=$2 AND c.principal_user_id=$3 AND i.tenant_id=$4
		  AND i.family_id=$5 AND c.enabled AND c.revoked_at IS NULL AND c.credential_expires_at>$7
		  AND (SELECT count(*) FROM public.intelligence_source_v2_connection_chats exact_scope WHERE exact_scope.connection_id=c.id)=1
		FOR UPDATE OF c`, identity.ConnectionID, identity.InstallationID, identity.PrincipalUserID, identity.TenantID, identity.FamilyID, identity.ChatID, now).Scan(&fenceSequence)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceSourceV2BackfillStart{}, httptransport.ErrIntelligenceSourceForbidden
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2BackfillStart{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	backfillID := uuid.NewString()
	var createdAt time.Time
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO public.intelligence_source_v2_backfills(id,connection_id,chat_id,fence_sequence,created_at)
		VALUES($1,$2,$3,$4,$5) RETURNING created_at`, backfillID, identity.ConnectionID, identity.ChatID, fenceSequence, now).Scan(&createdAt); err != nil {
		return httptransport.IntelligenceSourceV2BackfillStart{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	if err := tx.Commit(); err != nil {
		return httptransport.IntelligenceSourceV2BackfillStart{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	cursor := intelligenceSourceV2Cursor{
		Kind: "snapshot", ConnectionID: identity.ConnectionID, ChatID: identity.ChatID,
		BackfillID: backfillID, Page: 0, IssuedAt: createdAt.Unix(),
	}
	token := s.encodeIntelligenceSourceV2Cursor(cursor)
	if token == "" {
		return httptransport.IntelligenceSourceV2BackfillStart{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	return httptransport.IntelligenceSourceV2BackfillStart{
		SchemaVersion: "v2", BackfillID: backfillID, SnapshotCursor: token, ScopeReset: true,
	}, nil
}

func (s *Server) intelligenceSourceV2BackfillSnapshots(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, backfillID, rawCursor string, limit int) (httptransport.IntelligenceSourceV2SnapshotPage, error) {
	if s.sqlDB == nil || limit < 1 || limit > intelligenceSourceV2SnapshotPageLimit || backfillID == "" {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceInvalidRequest
	}
	cursor, err := s.decodeIntelligenceSourceV2Cursor(rawCursor, identity, "snapshot")
	if err != nil {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, err
	}
	if cursor.BackfillID != backfillID {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceInvalidCursor
	}
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	var fenceSequence int64
	var nextPage int
	var lastCreatedAt, lastResourceID sql.NullString
	err = tx.QueryRowContext(ctx, `
		SELECT b.fence_sequence,b.next_page,b.last_created_at,b.last_resource_id
		FROM public.intelligence_source_v2_backfills b
		WHERE b.id=$1 AND b.connection_id=$2 AND b.chat_id=$3
		FOR UPDATE`, backfillID, identity.ConnectionID, identity.ChatID).Scan(&fenceSequence, &nextPage, &lastCreatedAt, &lastResourceID)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceInvalidCursor
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	allowed, err := intelligenceSourceV2LockReadScope(ctx, tx, identity, s.intelligenceOIDCNow())
	if err != nil {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, err
	}
	if !allowed {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceForbidden
	}
	if cursor.Page > nextPage {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceInvalidCursor
	}
	var hasMore bool
	var pageCreatedAt time.Time
	if cursor.Page < nextPage {
		err = tx.QueryRowContext(ctx, `
			SELECT has_more,created_at FROM public.intelligence_source_v2_backfill_pages
			WHERE backfill_id=$1 AND page_number=$2`, backfillID, cursor.Page).Scan(&hasMore, &pageCreatedAt)
		if errors.Is(err, sql.ErrNoRows) {
			return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceInvalidCursor
		}
		if err != nil {
			return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable
		}
	} else {
		if lastCreatedAt.Valid != lastResourceID.Valid {
			return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable
		}
		messages, err := s.readIntelligenceSourceV2BackfillMessages(ctx, tx, identity, lastCreatedAt, lastResourceID, limit+1)
		if err != nil {
			return httptransport.IntelligenceSourceV2SnapshotPage{}, err
		}
		hasMore = len(messages) > limit
		if hasMore {
			messages = messages[:limit]
		}
		pageCreatedAt = s.intelligenceOIDCNow()
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO public.intelligence_source_v2_backfill_pages(backfill_id,page_number,has_more,created_at)
			VALUES($1,$2,$3,$4)`, backfillID, cursor.Page, hasMore, pageCreatedAt); err != nil {
			return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable
		}
		for index := range messages {
			if err := s.insertIntelligenceSourceV2BackfillSnapshot(ctx, tx, identity, backfillID, cursor.Page, index, messages[index]); err != nil {
				return httptransport.IntelligenceSourceV2SnapshotPage{}, err
			}
		}
		if len(messages) > 0 {
			last := messages[len(messages)-1]
			lastCreatedAt, lastResourceID = sql.NullString{String: last.createdAt, Valid: true}, sql.NullString{String: last.resourceID, Valid: true}
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE public.intelligence_source_v2_backfills
			SET next_page=next_page+1,last_created_at=$2,last_resource_id=$3,completed=$4
			WHERE id=$1`, backfillID, nullableString(lastCreatedAt), nullableString(lastResourceID), !hasMore); err != nil {
			return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable
		}
	}
	snapshots, err := s.loadIntelligenceSourceV2BackfillPage(ctx, tx, identity, backfillID, cursor.Page)
	if err != nil {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, err
	}
	page := httptransport.IntelligenceSourceV2SnapshotPage{SchemaVersion: "v2", Snapshots: snapshots, HasMore: hasMore}
	if hasMore {
		next := cursor
		next.Page++
		next.IssuedAt = pageCreatedAt.Unix()
		page.NextSnapshotCursor = s.encodeIntelligenceSourceV2Cursor(next)
		if page.NextSnapshotCursor == "" {
			return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable
		}
	} else {
		page.FenceCursor = s.encodeIntelligenceSourceV2Cursor(intelligenceSourceV2Cursor{
			Kind: "event", ConnectionID: identity.ConnectionID, ChatID: identity.ChatID,
			BackfillID: backfillID, Sequence: fenceSequence, IssuedAt: pageCreatedAt.Unix(),
		})
		if page.FenceCursor == "" {
			return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable
		}
	}
	if err := tx.Commit(); err != nil {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	return page, nil
}

func (s *Server) readIntelligenceSourceV2BackfillMessages(ctx context.Context, tx *sql.Tx, identity httptransport.IntelligenceSourceIdentity, lastCreatedAt, lastResourceID sql.NullString, limit int) ([]sourceV2BackfillMessage, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT m.id,m.created_at,m.content,m.ciphertext,m.nonce,m.key_version,m.encryption_protocol,
		       jsonb_build_object('chat_id',m.chat_id,'sender_id',m.sender_id,'message_type',m.type,
		                          'created_at',m.created_at,'updated_at',m.updated_at,'edited',m.is_edited),now()
		FROM public.messages m
		JOIN public.chats scoped_chat ON scoped_chat.id=m.chat_id AND scoped_chat.encryption_protocol IN ('legacy_plaintext','server_at_rest')
		WHERE m.chat_id=$1 AND m.deleted_at IS NULL AND m.type='text'
		  AND ((m.encryption_protocol='legacy_plaintext' AND m.content IS NOT NULL)
		       OR (m.encryption_protocol='server_at_rest' AND m.ciphertext IS NOT NULL AND m.nonce IS NOT NULL))
		  AND ($2::text IS NULL OR m.created_at>$2 OR (m.created_at=$2 AND m.id>$3))
		  AND NOT EXISTS (SELECT 1 FROM public.message_user_deletions mud WHERE mud.message_id=m.id AND mud.user_id=$4)
		ORDER BY m.created_at,m.id LIMIT $5`, identity.ChatID, nullableString(lastCreatedAt), nullableString(lastResourceID), identity.PrincipalUserID, limit)
	if err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = rows.Close() }()
	messages := make([]sourceV2BackfillMessage, 0, limit)
	for rows.Next() {
		var message sourceV2BackfillMessage
		if err := rows.Scan(&message.resourceID, &message.createdAt, &message.content, &message.ciphertext, &message.nonce, &message.keyVersion, &message.protocol, &message.metadata, &message.observedAt); err != nil {
			return nil, httptransport.ErrIntelligenceSourceUnavailable
		}
		messages = append(messages, message)
	}
	if err := rows.Err(); err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	return messages, nil
}

func (s *Server) insertIntelligenceSourceV2BackfillSnapshot(ctx context.Context, tx *sql.Tx, identity httptransport.IntelligenceSourceIdentity, backfillID string, pageNumber, itemNumber int, message sourceV2BackfillMessage) error {
	revisionID := uuid.NewString()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_source_v2_revisions
			(revision_id,connection_id,resource_id,chat_id,encryption_protocol,metadata,deleted,observed_at)
		VALUES($1,$2,$3,$4,$5,$6,false,$7)`, revisionID, identity.ConnectionID, message.resourceID, identity.ChatID, message.protocol, message.metadata, message.observedAt); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if message.protocol == "legacy_plaintext" {
		if !message.content.Valid {
			return httptransport.ErrIntelligenceSourceUnavailable
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_revision_payloads(connection_id,revision_id,content) VALUES($1,$2,$3)`, identity.ConnectionID, revisionID, message.content.String)
		if err != nil {
			return httptransport.ErrIntelligenceSourceUnavailable
		}
	} else {
		if !message.ciphertext.Valid || !message.nonce.Valid {
			return httptransport.ErrIntelligenceSourceUnavailable
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO public.intelligence_source_v2_revision_payloads(connection_id,revision_id,ciphertext,nonce,key_version)
			VALUES($1,$2,$3,$4,$5)`, identity.ConnectionID, revisionID, message.ciphertext.String, message.nonce.String, nullableInt64(message.keyVersion))
		if err != nil {
			return httptransport.ErrIntelligenceSourceUnavailable
		}
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_source_v2_backfill_items
			(backfill_id,page_number,item_number,connection_id,resource_id,revision_id,source_created_at)
		VALUES($1,$2,$3,$4,$5,$6,$7)`, backfillID, pageNumber, itemNumber, identity.ConnectionID, message.resourceID, revisionID, message.createdAt); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil
}

func (s *Server) loadIntelligenceSourceV2BackfillPage(ctx context.Context, tx *sql.Tx, identity httptransport.IntelligenceSourceIdentity, backfillID string, pageNumber int) ([]httptransport.IntelligenceSourceV2ResourceSnapshot, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT r.resource_id,r.revision_id,r.metadata,r.observed_at,r.encryption_protocol,
		       p.content,p.ciphertext,p.nonce
		FROM public.intelligence_source_v2_backfill_items item
		JOIN public.intelligence_source_v2_revisions r
		  ON r.connection_id=item.connection_id AND r.resource_id=item.resource_id AND r.revision_id=item.revision_id
		JOIN public.intelligence_source_v2_revision_payloads p ON p.connection_id=r.connection_id AND p.revision_id=r.revision_id
		WHERE item.backfill_id=$1 AND item.page_number=$2
		ORDER BY item.item_number`, backfillID, pageNumber)
	if err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = rows.Close() }()
	snapshots := make([]httptransport.IntelligenceSourceV2ResourceSnapshot, 0)
	for rows.Next() {
		var snapshot httptransport.IntelligenceSourceV2ResourceSnapshot
		var metadata []byte
		var protocol string
		var content, ciphertext, nonce sql.NullString
		if err := rows.Scan(&snapshot.ResourceID, &snapshot.RevisionID, &metadata, &snapshot.ObservedAt, &protocol, &content, &ciphertext, &nonce); err != nil {
			return nil, httptransport.ErrIntelligenceSourceUnavailable
		}
		if err := json.Unmarshal(metadata, &snapshot.Metadata); err != nil {
			return nil, httptransport.ErrIntelligenceSourceUnavailable
		}
		if protocol == "server_at_rest" {
			if !ciphertext.Valid || !nonce.Valid {
				return nil, httptransport.ErrIntelligenceSourceUnavailable
			}
			plaintext, err := s.decryptServerAtRest(identity.FamilyID, ciphertext.String, nonce.String)
			if err != nil || plaintext == nil {
				return nil, httptransport.ErrIntelligenceSourceUnavailable
			}
			snapshot.Content = *plaintext
		} else if protocol == "legacy_plaintext" && content.Valid {
			snapshot.Content = content.String
		} else {
			return nil, httptransport.ErrIntelligenceSourceUnavailable
		}
		snapshot.SchemaVersion = "v2"
		snapshot.TenantID = identity.TenantID
		snapshot.ConnectionID = identity.ConnectionID
		snapshot.PrincipalID = identity.PrincipalUserID
		snapshot.ContentRevisionID = snapshot.RevisionID
		snapshot.MetadataRevisionID = snapshot.RevisionID
		snapshots = append(snapshots, snapshot)
	}
	if err := rows.Err(); err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	return snapshots, nil
}
