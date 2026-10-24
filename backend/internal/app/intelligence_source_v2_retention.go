package app

import (
	"context"
	"strings"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

const (
	intelligenceSourceV2ContentRetention   = 30 * 24 * time.Hour
	intelligenceSourceV2TombstoneMargin    = 7 * 24 * time.Hour
	intelligenceSourceV2RestoreFreshness   = 5 * time.Minute
	intelligenceSourceV2InventoryFreshness = 24 * time.Hour
)

type intelligenceSourceV2RetentionResult struct {
	TombstonesPruned int64
	BackupsPruned    int64
}

// IntelligenceSourceV2RestoreTombstone describes a metadata-only invalidation
// entry; it does not contain source content.
type IntelligenceSourceV2RestoreTombstone struct {
	EventID      string    `json:"event_id"`
	ConnectionID string    `json:"connection_id"`
	ResourceID   string    `json:"resource_id"`
	RevisionID   string    `json:"revision_id"`
	ChatID       string    `json:"chat_id"`
	Sequence     int64     `json:"sequence"`
	Reason       string    `json:"reason"`
	CreatedAt    time.Time `json:"created_at"`
}

func (s *Server) requireIntelligenceSourceV2RestoreReady(ctx context.Context) error {
	if s.intelligenceSourceV2Persistence() == nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	expectedEpoch := strings.TrimSpace(s.cfg.IntelligenceSourceV2RestoreEpoch)
	if expectedEpoch == "" {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	blocked, restoreEpoch, err := s.intelligenceSourceV2Persistence().RestoreStatus(ctx)
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if blocked {
		return httptransport.ErrIntelligenceSourceDisabled
	}
	if restoreEpoch != expectedEpoch {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil
}

// initializeIntelligenceSourceV2RestoreEpoch binds a fresh, empty database to
// deployment state. A restored database with source history cannot take this
// path and stays closed until the restore coordinator verifies replay.
func (s *Server) initializeIntelligenceSourceV2RestoreEpoch(ctx context.Context) error {
	expectedEpoch := strings.TrimSpace(s.cfg.IntelligenceSourceV2RestoreEpoch)
	if s.intelligenceSourceV2Persistence() == nil || expectedEpoch == "" {
		return nil
	}
	if err := s.intelligenceSourceV2Persistence().InitializeRestoreEpoch(ctx, expectedEpoch, s.intelligenceOIDCNow()); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil
}

func (s *Server) intelligenceSourceV2Operations() *IntelligenceSourceV2Operations {
	return newIntelligenceSourceV2Operations(s.intelligenceSourceV2Persistence(), s.intelligenceOIDCNow)
}

// RegisterIntelligenceSourceV2BackupHorizon records one backup's actual
// creation and last-restorable timestamps from the backup controller.
func (s *Server) RegisterIntelligenceSourceV2BackupHorizon(ctx context.Context, backupID string, backupCreatedAt, restorableUntil time.Time) error {
	return s.intelligenceSourceV2Operations().RegisterIntelligenceSourceV2BackupHorizon(ctx, backupID, backupCreatedAt, restorableUntil)
}

// MarkIntelligenceSourceV2BackupInventoryVerified records a complete backup
// inventory from the external backup controller. Tombstone pruning remains
// disabled until this checkpoint is current.
func (s *Server) MarkIntelligenceSourceV2BackupInventoryVerified(ctx context.Context, verifiedAt time.Time) error {
	return s.intelligenceSourceV2Operations().MarkIntelligenceSourceV2BackupInventoryVerified(ctx, verifiedAt)
}

func (s *Server) cleanupIntelligenceSourceV2Retention(ctx context.Context, now time.Time) (intelligenceSourceV2RetentionResult, error) {
	if s.intelligenceSourceV2Persistence() == nil || now.IsZero() {
		return intelligenceSourceV2RetentionResult{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	stored, err := s.intelligenceSourceV2Persistence().CleanupRetention(ctx, now, s.intelligenceOIDCNow().UTC())
	if err != nil {
		return intelligenceSourceV2RetentionResult{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	return intelligenceSourceV2RetentionResult{TombstonesPruned: stored.TombstonesPruned, BackupsPruned: stored.BackupsPruned}, nil
}

// BeginIntelligenceSourceV2Restore blocks all v2 source routes. Reopening is
// deliberately unavailable until an independent tombstone ledger or verified
// consumer scope reset is integrated; Messenger database state alone can roll
// back with the content backup and cannot prove tombstone freshness.
func (s *Server) BeginIntelligenceSourceV2Restore(ctx context.Context, restoreID string, backupCreatedAt time.Time) ([]IntelligenceSourceV2RestoreTombstone, error) {
	if s.intelligenceSourceV2Persistence() == nil || restoreID == "" || len(restoreID) > 256 || backupCreatedAt.IsZero() || strings.TrimSpace(s.cfg.IntelligenceSourceV2RestoreEpoch) == "" {
		return nil, httptransport.ErrIntelligenceSourceInvalidRequest
	}
	if err := s.intelligenceSourceV2Persistence().BeginRestore(ctx, restoreID, backupCreatedAt, s.intelligenceOIDCNow()); err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil, httptransport.ErrIntelligenceSourceUnavailable
}

// CompleteIntelligenceSourceV2Restore cannot reopen routes from a ledger that
// was restored from the same database snapshot as the content it must suppress.
// Keep the global gate closed until an independent proof source is wired in.
func (s *Server) CompleteIntelligenceSourceV2Restore(context.Context, string, map[string]int64, time.Time) error {
	return httptransport.ErrIntelligenceSourceUnavailable
}
