package app

import (
	"context"
	"database/sql"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

// IntelligenceSourceV2Operations coordinates backup inventory updates using
// the same database state as the source server.
type IntelligenceSourceV2Operations struct {
	db  *sql.DB
	now func() time.Time
}

// NewIntelligenceSourceV2Operations constructs a database-backed coordinator
// whose freshness checks use the UTC wall clock.
func NewIntelligenceSourceV2Operations(db *sql.DB) *IntelligenceSourceV2Operations {
	return newIntelligenceSourceV2Operations(db, func() time.Time { return time.Now().UTC() })
}

func newIntelligenceSourceV2Operations(db *sql.DB, now func() time.Time) *IntelligenceSourceV2Operations {
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return &IntelligenceSourceV2Operations{db: db, now: now}
}

// RegisterIntelligenceSourceV2BackupHorizon records one backup's actual
// creation and last-restorable timestamps from the backup controller.
func (o *IntelligenceSourceV2Operations) RegisterIntelligenceSourceV2BackupHorizon(ctx context.Context, backupID string, backupCreatedAt, restorableUntil time.Time) error {
	if o.db == nil || backupID == "" || len(backupID) > 256 || backupCreatedAt.IsZero() || restorableUntil.Before(backupCreatedAt) || restorableUntil.After(backupCreatedAt.Add(intelligenceSourceV2ContentRetention)) {
		return httptransport.ErrIntelligenceSourceInvalidRequest
	}
	tx, err := o.db.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	var inventoryID string
	if err := tx.QueryRowContext(ctx, `SELECT inventory_id FROM public.intelligence_source_v2_backup_inventory_state WHERE inventory_id='global' FOR UPDATE`).Scan(&inventoryID); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	result, err := tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_source_v2_backup_horizons(backup_id,backup_created_at,restorable_until)
		VALUES($1,$2,$3) ON CONFLICT (backup_id) DO NOTHING`, backupID, backupCreatedAt.UTC(), restorableUntil.UTC())
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if affected, err := result.RowsAffected(); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	} else if affected == 0 {
		var currentCreated, currentRestorable time.Time
		if err := tx.QueryRowContext(ctx, `SELECT backup_created_at,restorable_until FROM public.intelligence_source_v2_backup_horizons WHERE backup_id=$1`, backupID).Scan(&currentCreated, &currentRestorable); err != nil {
			return httptransport.ErrIntelligenceSourceUnavailable
		}
		if !currentCreated.Equal(backupCreatedAt.UTC()) || !currentRestorable.Equal(restorableUntil.UTC()) {
			return httptransport.ErrIntelligenceSourceInvalidRequest
		}
	} else {
		// A newly declared backup changes the restorable inventory. Invalidate
		// the previous completeness checkpoint before the backup is created.
		if _, err := tx.ExecContext(ctx, `
			UPDATE public.intelligence_source_v2_backup_inventory_state
			SET complete=false,verified_at=NULL WHERE inventory_id='global'`); err != nil {
			return httptransport.ErrIntelligenceSourceUnavailable
		}
	}
	if err := tx.Commit(); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil
}

// MarkIntelligenceSourceV2BackupInventoryVerified records a complete backup
// inventory from the external backup controller. Tombstone pruning remains
// disabled until this checkpoint is current.
func (o *IntelligenceSourceV2Operations) MarkIntelligenceSourceV2BackupInventoryVerified(ctx context.Context, verifiedAt time.Time) error {
	if o.db == nil || verifiedAt.IsZero() || verifiedAt.After(o.now().Add(time.Minute)) {
		return httptransport.ErrIntelligenceSourceInvalidRequest
	}
	result, err := o.db.ExecContext(ctx, `
		UPDATE public.intelligence_source_v2_backup_inventory_state
		SET complete=true,verified_at=$1 WHERE inventory_id='global'`, verifiedAt.UTC())
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil
}
