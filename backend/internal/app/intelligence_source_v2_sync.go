package app

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	adapterintelligencesourcev2 "stovo-messenger/backend/internal/adapters/intelligencesourcev2"
	httptransport "stovo-messenger/backend/internal/transport/http"
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

func (s *Server) intelligenceSourceV2StartBackfill(ctx context.Context, identity httptransport.IntelligenceSourceIdentity) (httptransport.IntelligenceSourceV2BackfillStart, error) {
	if s.intelligenceSourceV2Persistence() == nil || s.cfg.JWTSecret == "" {
		return httptransport.IntelligenceSourceV2BackfillStart{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	now := s.intelligenceOIDCNow()
	started, err := s.intelligenceSourceV2Persistence().StartBackfill(ctx, identity, now)
	if errors.Is(err, adapterintelligencesourcev2.ErrNotFound) {
		return httptransport.IntelligenceSourceV2BackfillStart{}, httptransport.ErrIntelligenceSourceForbidden
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2BackfillStart{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	cursor := intelligenceSourceV2Cursor{
		Kind: "snapshot", ConnectionID: identity.ConnectionID, ChatID: identity.ChatID,
		BackfillID: started.BackfillID, Page: 0, IssuedAt: started.CreatedAt.Unix(),
	}
	token := s.encodeIntelligenceSourceV2Cursor(cursor)
	if token == "" {
		return httptransport.IntelligenceSourceV2BackfillStart{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	return httptransport.IntelligenceSourceV2BackfillStart{
		SchemaVersion: "v2", BackfillID: started.BackfillID, SnapshotCursor: token, ScopeReset: true,
	}, nil
}

func (s *Server) intelligenceSourceV2BackfillSnapshots(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, backfillID, rawCursor string, limit int) (httptransport.IntelligenceSourceV2SnapshotPage, error) {
	if s.intelligenceSourceV2Persistence() == nil || limit < 1 || limit > intelligenceSourceV2SnapshotPageLimit || backfillID == "" {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceInvalidRequest
	}
	cursor, err := s.decodeIntelligenceSourceV2Cursor(rawCursor, identity, "snapshot")
	if err != nil {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, err
	}
	if cursor.BackfillID != backfillID {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceInvalidCursor
	}
	stored, err := s.intelligenceSourceV2Persistence().BuildBackfillPage(ctx, identity, backfillID, cursor.Page, limit, s.intelligenceOIDCNow())
	if errors.Is(err, adapterintelligencesourcev2.ErrNotFound) || errors.Is(err, adapterintelligencesourcev2.ErrInvalidRequest) {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceInvalidCursor
	}
	if errors.Is(err, adapterintelligencesourcev2.ErrForbidden) {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceForbidden
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	snapshots := make([]httptransport.IntelligenceSourceV2ResourceSnapshot, 0, len(stored.Snapshots))
	for _, record := range stored.Snapshots {
		var snapshot httptransport.IntelligenceSourceV2ResourceSnapshot
		snapshot.ResourceID, snapshot.RevisionID, snapshot.ObservedAt = record.ResourceID, record.RevisionID, record.ObservedAt
		if err := json.Unmarshal(record.Metadata, &snapshot.Metadata); err != nil {
			return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable
		}
		if record.Protocol == "server_at_rest" {
			if !record.Ciphertext.Valid || !record.Nonce.Valid { return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable }
			plaintext, err := s.decryptServerAtRest(identity.FamilyID, record.Ciphertext.String, record.Nonce.String)
			if err != nil || plaintext == nil { return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable }
			snapshot.Content = *plaintext
		} else if record.Protocol == "legacy_plaintext" && record.Content.Valid {
			snapshot.Content = record.Content.String
		} else { return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable }
		snapshot.SchemaVersion, snapshot.TenantID, snapshot.ConnectionID, snapshot.PrincipalID = "v2", identity.TenantID, identity.ConnectionID, identity.PrincipalUserID
		snapshot.ContentRevisionID, snapshot.MetadataRevisionID = snapshot.RevisionID, snapshot.RevisionID
		snapshots = append(snapshots, snapshot)
	}
	page := httptransport.IntelligenceSourceV2SnapshotPage{SchemaVersion: "v2", Snapshots: snapshots, HasMore: stored.HasMore}
	if stored.HasMore {
		next := cursor
		next.Page++
		next.IssuedAt = stored.CreatedAt.Unix()
		page.NextSnapshotCursor = s.encodeIntelligenceSourceV2Cursor(next)
		if page.NextSnapshotCursor == "" { return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable }
	} else {
		page.FenceCursor = s.encodeIntelligenceSourceV2Cursor(intelligenceSourceV2Cursor{Kind: "event", ConnectionID: identity.ConnectionID, ChatID: identity.ChatID, BackfillID: backfillID, Sequence: stored.FenceSequence, IssuedAt: stored.CreatedAt.Unix()})
		if page.FenceCursor == "" { return httptransport.IntelligenceSourceV2SnapshotPage{}, httptransport.ErrIntelligenceSourceUnavailable }
	}
	return page, nil
}
