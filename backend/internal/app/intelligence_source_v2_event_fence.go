package app

import (
	"context"
	"errors"

	adapterintelligencesourcev2 "stovo-messenger/backend/internal/adapters/intelligencesourcev2"
	httptransport "stovo-messenger/backend/internal/transport/http"
)

func (s *Server) intelligenceSourceV2EventFence(ctx context.Context, identity httptransport.IntelligenceSourceIdentity) (httptransport.IntelligenceSourceV2EventFence, error) {
	if s.intelligenceSourceV2Persistence() == nil || s.cfg.JWTSecret == "" {
		return httptransport.IntelligenceSourceV2EventFence{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	now := s.intelligenceOIDCNow()
	started, err := s.intelligenceSourceV2Persistence().StartBackfill(ctx, identity, now)
	if errors.Is(err, adapterintelligencesourcev2.ErrNotFound) {
		return httptransport.IntelligenceSourceV2EventFence{}, httptransport.ErrIntelligenceSourceForbidden
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2EventFence{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	cursor := s.encodeIntelligenceSourceV2Cursor(intelligenceSourceV2Cursor{
		Kind: "event", ConnectionID: identity.ConnectionID, ChatID: identity.ChatID,
		BackfillID: started.BackfillID, Sequence: started.Fence, IssuedAt: started.CreatedAt.Unix(),
	})
	if cursor == "" {
		return httptransport.IntelligenceSourceV2EventFence{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	return httptransport.IntelligenceSourceV2EventFence{
		SchemaVersion: "v2", EventCursor: cursor, FenceSequence: started.Fence,
	}, nil
}
