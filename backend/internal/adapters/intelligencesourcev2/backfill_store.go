package intelligencesourcev2

import (
	"context"
	"database/sql"
	"errors"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/google/uuid"
)

type BackfillStart struct {
	BackfillID string
	Fence      int64
	CreatedAt  time.Time
}

func nullableChatScope(chatID string) any {
	if chatID == "" {
		return nil
	}
	return chatID
}

func (s *Store) StartBackfill(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, now time.Time) (BackfillStart, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return BackfillStart{}, err
	}
	defer func() { _ = tx.Rollback() }()
	var fence int64
	err = tx.QueryRowContext(ctx, `
		SELECT c.next_sequence-1
		FROM public.intelligence_source_v2_connections c
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled
		JOIN public.users u ON u.id=c.principal_user_id AND u.is_active=1 AND u.family_id=i.family_id
		JOIN public.chats ch ON ((c.scope_kind='chat' AND ch.id=$6 AND EXISTS(SELECT 1 FROM public.intelligence_source_v2_connection_chats s WHERE s.connection_id=c.id AND s.chat_id=ch.id)) OR (c.scope_kind='space' AND c.scope_family_id=ch.family_id)) AND ch.family_id=i.family_id
		  AND ch.encryption_protocol IN ('legacy_plaintext','server_at_rest')
		JOIN public.chat_members cm ON cm.chat_id=ch.id AND cm.user_id=u.id
		JOIN public.intelligence_source_v2_connection_grants read_grant
		  ON read_grant.connection_id=c.id AND read_grant.grant_type='read' AND read_grant.granted
		WHERE c.id=$1 AND c.installation_id=$2 AND c.principal_user_id=$3 AND i.tenant_id=$4
		  AND i.family_id=$5 AND c.enabled AND c.revoked_at IS NULL AND c.credential_expires_at>$7
		  AND ((c.scope_kind='chat' AND (SELECT count(*) FROM public.intelligence_source_v2_connection_chats exact_scope WHERE exact_scope.connection_id=c.id)=1) OR (c.scope_kind='space' AND c.scope_family_id=i.family_id AND (u.role='owner' OR EXISTS(SELECT 1 FROM public.server_roles sr CROSS JOIN LATERAL jsonb_array_elements_text(sr.permissions::jsonb) perm WHERE sr.id=u.role_id AND sr.family_id=u.family_id AND perm='manage_integrations'))))
		FOR UPDATE OF c`, identity.ConnectionID, identity.InstallationID, identity.PrincipalUserID, identity.TenantID, identity.FamilyID, identity.ChatID, now).Scan(&fence)
	if errors.Is(err, sql.ErrNoRows) {
		return BackfillStart{}, ErrNotFound
	}
	if err != nil {
		return BackfillStart{}, err
	}
	result := BackfillStart{BackfillID: uuid.NewString(), Fence: fence}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO public.intelligence_source_v2_backfills(id,connection_id,chat_id,fence_sequence,created_at)
		VALUES($1,$2,$3,$4,$5) RETURNING created_at`, result.BackfillID, identity.ConnectionID, nullableChatScope(identity.ChatID), fence, now).Scan(&result.CreatedAt); err != nil {
		return BackfillStart{}, err
	}
	if err := tx.Commit(); err != nil {
		return BackfillStart{}, err
	}
	return result, nil
}
