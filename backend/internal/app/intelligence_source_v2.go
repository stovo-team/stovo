package app

import (
	"context"
	"errors"
	"net/http"
	"time"

	adapterintelligencesourcev2 "stovo-messenger/backend/internal/adapters/intelligencesourcev2"
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
	if s.intelligenceSourceV2Persistence() == nil || len(resourceIDs) == 0 || len(resourceIDs) > 100 || !validIntelligenceSourceV2Operation(operation) {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	decidedAt := time.Now().UTC()
	decisions, err := s.intelligenceSourceV2Persistence().AuthorizeResources(ctx, identity, resourceIDs, operation, decidedAt)
	if errors.Is(err, adapterintelligencesourcev2.ErrCredentialExpired) {
		return nil, httptransport.ErrIntelligenceSourceUnauthorized
	}
	if err != nil {
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
