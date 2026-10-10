package app

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

func (s *Server) intelligenceSourceV2Events(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, rawCursor string, limit int) (httptransport.IntelligenceSourceV2EventPage, error) {
	if s.sqlDB == nil || limit < 1 || limit > 200 {
		return httptransport.IntelligenceSourceV2EventPage{}, httptransport.ErrIntelligenceSourceInvalidRequest
	}
	cursor, err := s.decodeIntelligenceSourceV2Cursor(rawCursor, identity, "event")
	if err != nil {
		return httptransport.IntelligenceSourceV2EventPage{}, err
	}
	var backfillExists bool
	if err := s.sqlDB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM public.intelligence_source_v2_backfills WHERE id=$1 AND connection_id=$2 AND chat_id=$3)`, cursor.BackfillID, identity.ConnectionID, identity.ChatID).Scan(&backfillExists); err != nil {
		return httptransport.IntelligenceSourceV2EventPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	if !backfillExists {
		return httptransport.IntelligenceSourceV2EventPage{}, httptransport.ErrIntelligenceSourceInvalidCursor
	}
	rows, err := s.sqlDB.QueryContext(ctx, `
		SELECT e.event_id,e.resource_id,e.revision_id,e.sequence,e.chat_id,e.observed_at,e.kind,e.tombstone
		FROM public.intelligence_source_v2_events e
		JOIN public.intelligence_source_v2_connections c ON c.id=e.connection_id AND c.id=$1 AND c.enabled AND c.revoked_at IS NULL
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled AND i.tenant_id=$2 AND i.family_id=$3
		WHERE e.connection_id=$1 AND e.chat_id=$4 AND e.sequence>$5
		ORDER BY e.sequence ASC LIMIT $6`, identity.ConnectionID, identity.TenantID, identity.FamilyID, identity.ChatID, cursor.Sequence, limit+1)
	if err != nil {
		return httptransport.IntelligenceSourceV2EventPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = rows.Close() }()
	events := make([]httptransport.IntelligenceSourceV2Event, 0, limit)
	for rows.Next() {
		var event httptransport.IntelligenceSourceV2Event
		if err := rows.Scan(&event.EventID, &event.ResourceID, &event.RevisionID, &event.SourceSequence, &event.ContainerID, &event.ObservedAt, &event.Kind, &event.Tombstone); err != nil {
			return httptransport.IntelligenceSourceV2EventPage{}, httptransport.ErrIntelligenceSourceUnavailable
		}
		if len(events) == limit {
			break
		}
		event.SchemaVersion = "v2"
		event.TenantID = identity.TenantID
		event.ConnectionID = identity.ConnectionID
		event.PrincipalID = identity.PrincipalUserID
		event.OrderToken = strconv.FormatInt(event.SourceSequence, 10)
		event.PolicyRefs = []string{}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return httptransport.IntelligenceSourceV2EventPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	if err := rows.Close(); err != nil {
		return httptransport.IntelligenceSourceV2EventPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	hasMore := false
	if len(events) == limit {
		var exists bool
		if err := s.sqlDB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM public.intelligence_source_v2_events WHERE connection_id=$1 AND chat_id=$2 AND sequence>$3)`, identity.ConnectionID, identity.ChatID, events[len(events)-1].SourceSequence).Scan(&exists); err != nil {
			return httptransport.IntelligenceSourceV2EventPage{}, httptransport.ErrIntelligenceSourceUnavailable
		}
		hasMore = exists
	}
	page := httptransport.IntelligenceSourceV2EventPage{SchemaVersion: "v2", Events: events, HasMore: hasMore, NextCursor: rawCursor}
	if len(events) > 0 {
		cursor.Sequence = events[len(events)-1].SourceSequence
		cursor.IssuedAt = s.intelligenceOIDCNow().Unix()
		page.NextCursor = s.encodeIntelligenceSourceV2Cursor(cursor)
		if page.NextCursor == "" {
			return httptransport.IntelligenceSourceV2EventPage{}, httptransport.ErrIntelligenceSourceUnavailable
		}
	}
	return page, nil
}

func (s *Server) intelligenceSourceV2Snapshot(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, resourceID, revisionID string) (httptransport.IntelligenceSourceV2ResourceSnapshot, error) {
	if s.sqlDB == nil {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	allowed, err := intelligenceSourceV2LockReadScope(ctx, tx, identity, s.intelligenceOIDCNow())
	if err != nil {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, err
	}
	if !allowed {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceNotFound
	}
	var snapshot httptransport.IntelligenceSourceV2ResourceSnapshot
	var metadata []byte
	var protocol string
	var content, ciphertext, nonce sql.NullString
	err = tx.QueryRowContext(ctx, `
		SELECT r.resource_id,r.revision_id,r.metadata,r.observed_at,r.encryption_protocol,p.content,p.ciphertext,p.nonce
		FROM public.intelligence_source_v2_revisions r
		JOIN public.intelligence_source_v2_connections c ON c.id=r.connection_id AND c.id=$1 AND c.enabled AND c.revoked_at IS NULL
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled AND i.tenant_id=$2 AND i.family_id=$3
		JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=r.chat_id AND scope.chat_id=$4
		JOIN public.chats scoped_chat ON scoped_chat.id=r.chat_id AND scoped_chat.encryption_protocol IN ('legacy_plaintext','server_at_rest')
		JOIN public.intelligence_source_v2_revision_payloads p ON p.connection_id=r.connection_id AND p.revision_id=r.revision_id
		WHERE r.connection_id=$1 AND r.resource_id=$5 AND r.revision_id=$6 AND NOT r.deleted`,
		identity.ConnectionID, identity.TenantID, identity.FamilyID, identity.ChatID, resourceID, revisionID).Scan(
		&snapshot.ResourceID, &snapshot.RevisionID, &metadata, &snapshot.ObservedAt, &protocol, &content, &ciphertext, &nonce)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceNotFound
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	if err := json.Unmarshal(metadata, &snapshot.Metadata); err != nil {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	if protocol == "server_at_rest" {
		if !ciphertext.Valid || !nonce.Valid {
			return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceUnavailable
		}
		plaintext, err := s.decryptServerAtRest(identity.FamilyID, ciphertext.String, nonce.String)
		if err != nil || plaintext == nil {
			return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceUnavailable
		}
		snapshot.Content = *plaintext
	} else if protocol == "legacy_plaintext" && content.Valid {
		snapshot.Content = content.String
	} else {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceNotFound
	}
	snapshot.SchemaVersion = "v2"
	snapshot.TenantID = identity.TenantID
	snapshot.ConnectionID = identity.ConnectionID
	snapshot.PrincipalID = identity.PrincipalUserID
	snapshot.ContentRevisionID = snapshot.RevisionID
	snapshot.MetadataRevisionID = snapshot.RevisionID
	if err := tx.Commit(); err != nil {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	return snapshot, nil
}

func (s *Server) intelligenceSourceV2ResolveCitation(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, resourceID, revisionID string, locator httptransport.IntelligenceTextLocator) (httptransport.IntelligenceSourceV2CitationResolution, error) {
	snapshot, err := s.intelligenceSourceV2Snapshot(ctx, identity, resourceID, revisionID)
	if err != nil {
		return httptransport.IntelligenceSourceV2CitationResolution{}, err
	}
	text := []rune(snapshot.Content)
	if locator.Start < 0 || locator.End <= locator.Start || locator.End > len(text) {
		return httptransport.IntelligenceSourceV2CitationResolution{}, httptransport.ErrIntelligenceSourceNotFound
	}
	chatID, _ := snapshot.Metadata["chat_id"].(string)
	if chatID == "" || chatID != identity.ChatID {
		return httptransport.IntelligenceSourceV2CitationResolution{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	return httptransport.IntelligenceSourceV2CitationResolution{
		RevisionID:      revisionID,
		SourceReference: map[string]any{"resource_id": resourceID, "container_id": chatID},
		Excerpt:         string(text[locator.Start:locator.End]),
	}, nil
}

func intelligenceSourceV2ReadScope(ctx context.Context, queryer sourceV2QueryRower, identity httptransport.IntelligenceSourceIdentity, now time.Time) (bool, error) {
	var allowed bool
	err := queryer.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM public.intelligence_source_v2_connections c
			JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.id=$2 AND i.enabled
			JOIN public.users u ON u.id=c.principal_user_id AND u.id=$3 AND u.is_active=1 AND u.family_id=i.family_id
			JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=$6
			JOIN public.chats ch ON ch.id=scope.chat_id AND ch.family_id=i.family_id
			  AND ch.encryption_protocol IN ('legacy_plaintext','server_at_rest')
			JOIN public.chat_members cm ON cm.chat_id=ch.id AND cm.user_id=u.id
			JOIN public.intelligence_source_v2_connection_grants g ON g.connection_id=c.id AND g.grant_type='read' AND g.granted
		WHERE c.id=$1 AND c.enabled AND c.revoked_at IS NULL AND c.credential_expires_at>$7
			  AND i.tenant_id=$4 AND i.family_id=$5
			  AND (SELECT count(*) FROM public.intelligence_source_v2_connection_chats exact_scope WHERE exact_scope.connection_id=c.id)=1
		)`, identity.ConnectionID, identity.InstallationID, identity.PrincipalUserID, identity.TenantID, identity.FamilyID, identity.ChatID, now).Scan(&allowed)
	if err != nil {
		return false, httptransport.ErrIntelligenceSourceUnavailable
	}
	return allowed, nil
}

// Lock the source connection before checking current read policy and fetching
// content. Grant revocation and lifecycle invalidation take this same row with
// FOR UPDATE, so an overlapping read is ordered entirely before or after it.
func intelligenceSourceV2LockReadScope(ctx context.Context, tx *sql.Tx, identity httptransport.IntelligenceSourceIdentity, now time.Time) (bool, error) {
	var connectionID string
	err := tx.QueryRowContext(ctx, `
		SELECT c.id /* intelligence_source_v2_read_connection_lock */
		FROM public.intelligence_source_v2_connections c
		WHERE c.id=$1
		FOR SHARE OF c`, identity.ConnectionID).Scan(&connectionID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, httptransport.ErrIntelligenceSourceUnavailable
	}
	return intelligenceSourceV2ReadScope(ctx, tx, identity, now)
}

func (s *Server) encodeIntelligenceSourceV2Cursor(cursor intelligenceSourceV2Cursor) string {
	if s.cfg.JWTSecret == "" {
		return ""
	}
	payload, err := json.Marshal(cursor)
	if err != nil {
		return ""
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(s.cfg.JWTSecret+":intelligence-source-cursor:v2"))
	_, _ = mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Server) decodeIntelligenceSourceV2Cursor(token string, identity httptransport.IntelligenceSourceIdentity, expectedKind string) (intelligenceSourceV2Cursor, error) {
	invalid := httptransport.ErrIntelligenceSourceInvalidCursor
	parts := splitSourceCursor(token)
	if len(parts) != 2 || s.cfg.JWTSecret == "" {
		return intelligenceSourceV2Cursor{}, invalid
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	mac := hmac.New(sha256.New, []byte(s.cfg.JWTSecret+":intelligence-source-cursor:v2"))
	_, _ = mac.Write([]byte(parts[0]))
	if err != nil || !hmac.Equal(signature, mac.Sum(nil)) {
		return intelligenceSourceV2Cursor{}, invalid
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return intelligenceSourceV2Cursor{}, invalid
	}
	var cursor intelligenceSourceV2Cursor
	if json.Unmarshal(payload, &cursor) != nil || cursor.Kind != expectedKind || cursor.ConnectionID != identity.ConnectionID || cursor.ChatID != identity.ChatID || cursor.BackfillID == "" || cursor.Page < 0 || cursor.Sequence < 0 || cursor.IssuedAt <= 0 {
		return intelligenceSourceV2Cursor{}, invalid
	}
	now := s.intelligenceOIDCNow()
	issuedAt := time.Unix(cursor.IssuedAt, 0)
	if now.Sub(issuedAt) > intelligenceSourceV2CursorTTL || issuedAt.After(now.Add(time.Minute)) {
		return intelligenceSourceV2Cursor{}, httptransport.ErrIntelligenceSourceCursorExpired
	}
	return cursor, nil
}

func splitSourceCursor(token string) []string {
	if len(token) > 4096 {
		return nil
	}
	separator := -1
	for index, char := range token {
		if char == '.' {
			if separator >= 0 {
				return nil
			}
			separator = index
		}
	}
	if separator <= 0 || separator == len(token)-1 {
		return nil
	}
	return []string{token[:separator], token[separator+1:]}
}

func nullableString(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}

func nullableInt64(value sql.NullInt64) any {
	if !value.Valid {
		return nil
	}
	return value.Int64
}
