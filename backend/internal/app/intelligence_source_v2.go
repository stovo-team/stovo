package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/google/uuid"
)

func (s *Server) intelligenceSourceV2Handler() http.Handler {
	return httptransport.NewIntelligenceSourceV2Handler(httptransport.IntelligenceSourceV2HandlerConfig{
		Enabled: s.cfg.IntelligenceSourceEnabled && s.cfg.IntelligenceOIDCEnabled,
		Authenticate: func(ctx context.Context, token string) (httptransport.IntelligenceSourceIdentity, error) {
			if err := s.requireIntelligenceSourceV2ConsentEnabled(); err != nil {
				return httptransport.IntelligenceSourceIdentity{}, err
			}
			if err := s.requireIntelligenceSourceV2RestoreReady(ctx); err != nil {
				return httptransport.IntelligenceSourceIdentity{}, err
			}
			return s.authenticateIntelligenceSourceV2Credential(ctx, token)
		},
		Operations: httptransport.IntelligenceSourceV2Operations{
			Authorize:         s.intelligenceSourceV2Authorize,
			StartBackfill:     s.intelligenceSourceV2StartBackfill,
			BackfillSnapshots: s.intelligenceSourceV2BackfillSnapshots,
			Events:            s.intelligenceSourceV2Events,
			Snapshot:          s.intelligenceSourceV2Snapshot,
			ResolveCitation:   s.intelligenceSourceV2ResolveCitation,
		},
		Audit: s.auditIntelligenceSourceV2,
		Limit: func(ctx context.Context, connectionID string) error {
			if s.cache == nil {
				return httptransport.ErrIntelligenceSourceUnavailable
			}
			count, err := s.cache.Increment(ctx, "intelligence-source-v2:limit:"+connectionID, 60)
			if err != nil {
				return httptransport.ErrIntelligenceSourceUnavailable
			}
			if count > 60 {
				return httptransport.ErrIntelligenceSourceRateLimited
			}
			return nil
		},
	})
}

func (s *Server) intelligenceSourceV2Authorize(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, resourceIDs []string, operation string) ([]httptransport.IntelligenceSourceV2AuthorizationDecision, error) {
	if s.sqlDB == nil || len(resourceIDs) == 0 || len(resourceIDs) > 100 || !validIntelligenceSourceV2Operation(operation) {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	tx, err := s.sqlDB.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	decidedAt := time.Now().UTC()
	decisions := make([]httptransport.IntelligenceSourceV2AuthorizationDecision, 0, len(resourceIDs))
	for _, resourceID := range resourceIDs {
		var aiNotesEnabled, resourceInScope, readGranted, operationGranted bool
		var policyRevision string
		var credentialExpiresAt sql.NullTime
		err := tx.QueryRowContext(ctx, `
			SELECT f.ai_notes_enabled,
			       (u.is_active=1 AND cm.user_id IS NOT NULL AND ch.family_id=i.family_id
			        AND c.enabled AND c.revoked_at IS NULL AND c.credential_expires_at>$6
			        AND ch.encryption_protocol IN ('legacy_plaintext','server_at_rest')
			        AND m.deleted_at IS NULL AND m.type='text' AND m.encryption_protocol IN ('legacy_plaintext','server_at_rest')
			        AND NOT EXISTS (SELECT 1 FROM public.message_user_deletions mud WHERE mud.message_id=m.id AND mud.user_id=u.id)),
			       COALESCE(read_grant.granted,false),COALESCE(operation_grant.granted,false),
			       md5(ch.id || ':' || u.is_active::text || ':' || (cm.user_id IS NOT NULL)::text
			           || ':' || ch.encryption_protocol || ':' || ch.media_visibility || ':'
			           || COALESCE((SELECT string_agg(policy_member.user_id, ',' ORDER BY policy_member.user_id)
			                       FROM public.chat_members policy_member WHERE policy_member.chat_id=ch.id),'')
			           || ':' || f.ai_notes_enabled::text || ':' || COALESCE(read_grant.granted,false)::text
			           || ':' || COALESCE(operation_grant.granted,false)::text || ':' || c.enabled::text
			           || ':' || (c.revoked_at IS NULL)::text || ':' || (c.credential_expires_at>$6)::text
			           || ':' || (NOT EXISTS (SELECT 1 FROM public.message_user_deletions mud WHERE mud.message_id=m.id AND mud.user_id=u.id))::text),
			       c.credential_expires_at
			FROM public.messages m
			JOIN public.chats ch ON ch.id=m.chat_id
			JOIN public.families f ON f.id=ch.family_id
			JOIN public.intelligence_source_v2_connections c ON c.id=$2 AND c.principal_user_id=$3
			JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.family_id=f.id AND i.id=$7 AND i.tenant_id=$8 AND i.enabled
			JOIN public.users u ON u.id=c.principal_user_id AND u.family_id=i.family_id
			JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=ch.id AND scope.chat_id=$5
			LEFT JOIN public.chat_members cm ON cm.chat_id=ch.id AND cm.user_id=u.id
			LEFT JOIN public.intelligence_source_v2_connection_grants read_grant ON read_grant.connection_id=c.id AND read_grant.grant_type='read'
			LEFT JOIN public.intelligence_source_v2_connection_grants operation_grant ON operation_grant.connection_id=c.id AND operation_grant.grant_type=$4
			WHERE m.id=$1`,
			resourceID, identity.ConnectionID, identity.PrincipalUserID, operation, identity.ChatID, decidedAt, identity.InstallationID, identity.TenantID).Scan(
			&aiNotesEnabled, &resourceInScope, &readGranted, &operationGranted, &policyRevision, &credentialExpiresAt)
		if errors.Is(err, sql.ErrNoRows) {
			policyRevision = "not_found"
		} else if err != nil {
			return nil, httptransport.ErrIntelligenceSourceUnavailable
		}
		validUntil := decidedAt.Add(5 * time.Minute)
		if credentialExpiresAt.Valid {
			if !credentialExpiresAt.Time.After(decidedAt) {
				return nil, httptransport.ErrIntelligenceSourceUnauthorized
			}
			if credentialExpiresAt.Time.Before(validUntil) {
				validUntil = credentialExpiresAt.Time
			}
		}
		allowed := err == nil && resourceInScope && readGranted
		if operation != "read" {
			allowed = allowed && operationGranted
		}
		if operation == "process" {
			allowed = allowed && aiNotesEnabled
		}
		decisions = append(decisions, httptransport.IntelligenceSourceV2AuthorizationDecision{
			SchemaVersion: "v2", TenantID: identity.TenantID, ConnectionID: identity.ConnectionID,
			PrincipalID: identity.PrincipalUserID, ResourceID: resourceID, Operation: operation,
			Allowed: allowed, Scope: httptransport.IntelligenceSourceV2DecisionScope{Kind: "chat", ResourceID: identity.ChatID},
			PolicyRevision: policyRevision, DecidedAt: decidedAt, ValidUntil: validUntil,
		})
	}
	if err := tx.Commit(); err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	return decisions, nil
}

func (s *Server) auditIntelligenceSourceV2(ctx context.Context, record httptransport.IntelligenceSourceV2AuditRecord) error {
	if s.sqlDB == nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	_, err := s.sqlDB.ExecContext(ctx, `
		INSERT INTO public.intelligence_source_v2_audit(id,installation_id,connection_id,operation,result,created_at)
		VALUES($1,$2,$3,$4,$5,$6)`, uuid.NewString(), nullString(record.InstallationID), nullString(record.ConnectionID), record.Route, record.Result, time.Now().UTC())
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil
}

func validIntelligenceSourceV2Operation(operation string) bool {
	switch operation {
	case "read", "process", "external_transfer", "export":
		return true
	default:
		return false
	}
}
