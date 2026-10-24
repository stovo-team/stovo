package intelligencesourcev2

import (
	"context"
	"database/sql"
	"errors"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

type SnapshotRecord struct {
	ResourceID, RevisionID string
	Metadata []byte
	ObservedAt time.Time
	Protocol string
	Content, Ciphertext, Nonce sql.NullString
}

func (s *Store) LoadSnapshotForRead(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, resourceID, revisionID string, now time.Time) (SnapshotRecord, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return SnapshotRecord{}, err }
	defer func() { _ = tx.Rollback() }()
	allowed, err := lockReadScope(ctx, tx, identity, now)
	if err != nil { return SnapshotRecord{}, err }
	if !allowed { return SnapshotRecord{}, ErrNotFound }
	var record SnapshotRecord
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
		&record.ResourceID, &record.RevisionID, &record.Metadata, &record.ObservedAt, &record.Protocol, &record.Content, &record.Ciphertext, &record.Nonce)
	if errors.Is(err, sql.ErrNoRows) { return SnapshotRecord{}, ErrNotFound }
	if err != nil { return SnapshotRecord{}, err }
	if err := tx.Commit(); err != nil { return SnapshotRecord{}, err }
	return record, nil
}

func lockReadScope(ctx context.Context, tx *sql.Tx, identity httptransport.IntelligenceSourceIdentity, now time.Time) (bool, error) {
	var connectionID string
	err := tx.QueryRowContext(ctx, `SELECT c.id /* intelligence_source_v2_read_connection_lock */ FROM public.intelligence_source_v2_connections c WHERE c.id=$1 FOR SHARE OF c`, identity.ConnectionID).Scan(&connectionID)
	if errors.Is(err, sql.ErrNoRows) { return false, nil }
	if err != nil { return false, err }
	var allowed bool
	err = tx.QueryRowContext(ctx, `
		SELECT EXISTS (
		SELECT 1 FROM public.intelligence_source_v2_connections c
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled
		JOIN public.users u ON u.id=c.principal_user_id AND u.is_active=1 AND u.family_id=i.family_id
		JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=$6
		JOIN public.chats ch ON ch.id=scope.chat_id AND ch.family_id=i.family_id AND ch.encryption_protocol IN ('legacy_plaintext','server_at_rest')
		JOIN public.chat_members cm ON cm.chat_id=ch.id AND cm.user_id=u.id
		JOIN public.intelligence_source_v2_connection_grants g ON g.connection_id=c.id AND g.grant_type='read' AND g.granted
		WHERE c.id=$1 AND c.enabled AND c.revoked_at IS NULL AND c.credential_expires_at>$7
		  AND i.id=$2 AND u.id=$3 AND i.tenant_id=$4 AND i.family_id=$5
		  AND (SELECT count(*) FROM public.intelligence_source_v2_connection_chats exact_scope WHERE exact_scope.connection_id=c.id)=1
		)`, identity.ConnectionID, identity.InstallationID, identity.PrincipalUserID, identity.TenantID, identity.FamilyID, identity.ChatID, now).Scan(&allowed)
	return allowed, err
}
