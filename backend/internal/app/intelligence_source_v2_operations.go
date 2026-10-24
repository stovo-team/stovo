package app

import (
	"context"
	"errors"
	"time"

	adapterintelligencesourcev2 "stovo-messenger/backend/internal/adapters/intelligencesourcev2"
	httptransport "stovo-messenger/backend/internal/transport/http"
)

// IntelligenceSourceV2Operations coordinates backup inventory updates using
// the same database state as the source server.
type IntelligenceSourceV2Operations struct {
	store *adapterintelligencesourcev2.Store
	now   func() time.Time
}

// NewIntelligenceSourceV2Operations constructs a backup coordinator whose
// persistence is supplied by the PostgreSQL adapter.
func NewIntelligenceSourceV2Operations(store *adapterintelligencesourcev2.Store) *IntelligenceSourceV2Operations {
	return newIntelligenceSourceV2Operations(store, func() time.Time { return time.Now().UTC() })
}

func newIntelligenceSourceV2Operations(store *adapterintelligencesourcev2.Store, now func() time.Time) *IntelligenceSourceV2Operations {
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return &IntelligenceSourceV2Operations{store: store, now: now}
}

// RegisterIntelligenceSourceV2BackupHorizon records one backup's actual
// creation and last-restorable timestamps from the backup controller.
func (o *IntelligenceSourceV2Operations) RegisterIntelligenceSourceV2BackupHorizon(ctx context.Context, backupID string, backupCreatedAt, restorableUntil time.Time) error {
	if o.store == nil || backupID == "" || len(backupID) > 256 || backupCreatedAt.IsZero() || restorableUntil.Before(backupCreatedAt) || restorableUntil.After(backupCreatedAt.Add(intelligenceSourceV2ContentRetention)) {
		return httptransport.ErrIntelligenceSourceInvalidRequest
	}
	err := o.store.RegisterBackupHorizon(ctx, backupID, backupCreatedAt, restorableUntil)
	if errors.Is(err, adapterintelligencesourcev2.ErrBackupHorizonConflict) {
		return httptransport.ErrIntelligenceSourceInvalidRequest
	}
	if err != nil { return httptransport.ErrIntelligenceSourceUnavailable }
	return nil
}

// MarkIntelligenceSourceV2BackupInventoryVerified records a complete backup
// inventory from the external backup controller. Tombstone pruning remains
// disabled until this checkpoint is current.
func (o *IntelligenceSourceV2Operations) MarkIntelligenceSourceV2BackupInventoryVerified(ctx context.Context, verifiedAt time.Time) error {
	if o.store == nil || verifiedAt.IsZero() || verifiedAt.After(o.now().Add(time.Minute)) {
		return httptransport.ErrIntelligenceSourceInvalidRequest
	}
	updated, err := o.store.MarkInventoryVerified(ctx, verifiedAt)
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if !updated {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil
}
